import Docker from "./Docker.js";
import { handleDie, handleStart, handleStop, refresh } from "./handle.js";
import { type ContainerEvent, log } from "./util.js";
import Queue from "queue";

export function start(): void {
    const queue = new Queue({ concurrency: 1, autostart: true });

    let eventStream: NodeJS.ReadableStream | undefined;
    log("log", "Listening to events...");
    Docker.getEvents({ filters: { type: ["container"], event: ["start", "stop", "die"] } }, (err, stream) => {
        if (err || !stream) {
            throw err;
        }
        eventStream = stream; // for cleanup
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
                    const hostname = event.Actor?.Attributes?.hostname;
                    if (!["start", "stop", "die"].includes(action ?? "") || !hostname || !event.id) continue;
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
            .on("error", e => {
                log("error", "Error receiving Docker events: %s", e);
                queue.end(e as Error);
                // eslint-disable-next-line unicorn/no-process-exit
                process.exit(-1);
            })
            .on("end", () => {
                log("warn", "Docker events stream ended.");
                queue.end(new Error("Docker events stream ended."));
                // eslint-disable-next-line unicorn/no-process-exit
                process.exit(1);
            });
    });

    function cleanup(): void {
        log("log", "Shutting down event listener...");
        queue.end(new Error("Process terminated."));
        eventStream?.removeAllListeners();
        // eslint-disable-next-line unicorn/no-process-exit
        process.exit(0);
    }

    process.on("SIGINT", cleanup)
        .on("SIGTERM", cleanup)
        .on("SIGUSR1", () => {
            void refresh();
        });
}
