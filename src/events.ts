import Queue from "queue";

import Docker from "./Docker.js";
import { handleDie, handleStart, handleStop, refresh } from "./handle.js";
import { type ContainerEvent, log } from "./util.js";

export function start(): void {
    const queue = new Queue({ concurrency: 1, autostart: true });
    let eventStream: NodeJS.ReadableStream | undefined;
    let reconnectTimer: NodeJS.Timeout | undefined;
    let shuttingDown = false;
    let reconnectAttempts = 0;

    const reconnect = (reason: string, error?: unknown): void => {
        if (shuttingDown) return;

        eventStream?.removeAllListeners();
        eventStream = undefined;

        if (error) {
            log("warn", "Docker event stream disconnected (%s): %s", reason, error instanceof Error ? error.message : error);
        } else {
            log("warn", "Docker event stream disconnected (%s).", reason);
        }

        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000);
        reconnectAttempts += 1;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
            void connect();
        }, delay);
        log("log", "Reconnecting to Docker events in %dms.", delay);
    };

    const connect = async (): Promise<void> => {
        if (shuttingDown || eventStream) return;

        log("log", "Listening to events...");
        Docker.getEvents({ filters: { type: ["container"], event: ["start", "stop", "die"] } }, (err, stream) => {
            if (shuttingDown) {
                return;
            }
            if (err || !stream) {
                reconnect("connect", err);
                return;
            }

            reconnectAttempts = 0;
            log("log", "Docker event stream connected.");
            eventStream = stream;
            queue.push(async () => refresh());

            const decoder = new TextDecoder();
            let data = "";

            stream.on("data", (chunk: Buffer) => {
                data += decoder.decode(chunk, { stream: true });

                let index;
                while ((index = data.indexOf("\n")) >= 0) {
                    const line = data.slice(0, index).trim();
                    data = data.slice(index + 1);
                    if (!line) continue;

                    try {
                        const event = JSON.parse(line) as Partial<ContainerEvent>;
                        const action = event.Action;
                        const hostname = event.Actor?.Attributes.hostname;
                        if (!["start", "stop", "die"].includes(action ?? "") || !hostname || !event.id) continue;
                        log("debug", "Queueing event %s for %s (%s)", action, hostname, event.id);
                        queue.push(async () => {
                            switch (action) {
                                case "start": return handleStart(event.id!, hostname);
                                case "stop": return handleStop(event.id!, hostname);
                                case "die": return handleDie(event.id!, hostname);
                            }
                        });
                    } catch (error) {
                        log("warn", "Ignoring invalid Docker event payload: %s", (error as Error).message);
                    }
                }
            })
                .on("error", (e) => {
                    reconnect("error", e);
                })
                .on("end", () => {
                    reconnect("end");
                })
                .on("close", () => {
                    reconnect("close");
                });
        });
    };

    void connect();

    function cleanup(): void {
        shuttingDown = true;
        log("log", "Shutting down event listener...");
        clearTimeout(reconnectTimer);
        queue.end(new Error("Process terminated."));
        eventStream?.removeAllListeners();

        process.exit(0);
    }

    process.on("SIGINT", cleanup)
        .on("SIGTERM", cleanup)
        .on("SIGUSR1", () => {
            log("log", "Received SIGUSR1; forcing refresh.");
            void refresh();
        });
}
