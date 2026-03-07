import Docker from "./Docker.js";
import Config from "./Config.js";
import { type ContainerInfo } from "dockerode";
import { access, readFile, writeFile } from "node:fs/promises";

export function log(type: "log" | "warn" | "debug" | "error" | "group", formatter: string, ...args: Array<unknown>): void {
    console[type](`\u001B[90m%s \u001B[0m${formatter}`, new Date().toISOString(), ...args);
}

export async function getHosts(): Promise<Array<BasicContainerInfo>> {
    const containers = await Docker.listContainers();
    const hosts: Array<BasicContainerInfo> = [];
    let skippedMissingIp = 0;

    for (const container of containers) {
        const hostname = container.Labels.hostname;
        if (!hostname) continue;

        const ipFromLabel = container.Labels["hostname.ip"];
        const ipFromNetwork = getIp(container);
        const ip = ipFromLabel || ipFromNetwork;
        if (!ip) {
            skippedMissingIp += 1;
            log("debug", "Skipping %s (%s): no network IP and no hostname.ip label.", container.Names[0], container.Id);
            continue;
        }
        if (ipFromLabel && ipFromNetwork && ipFromLabel !== ipFromNetwork) {
            log("debug", "Using hostname.ip override for %s (%s): %s -> %s", hostname, container.Id, ipFromNetwork, ipFromLabel);
        }
        hosts.push({
            hostname,
            id:   container.Id,
            ip,
            name: container.Names[0]!.replace(/^\//, "")
        });
    }
    log("debug", "Host scan complete: %d containers, %d hosts, %d skipped for missing IP.", containers.length, hosts.length, skippedMissingIp);
    return hosts;
}

export function getIp(container: ContainerInfo): string | null {
    if (container.HostConfig.NetworkMode === "none") {
        return null;
    }

    try {
        return container.NetworkSettings.Networks[container.HostConfig.NetworkMode === "default" ? "bridge" : container.HostConfig.NetworkMode]?.IPAddress ?? null;
    } catch {
        return null;
    }
}

export function hasIp(container: ContainerInfo): boolean {
    return !!getIp(container);
}

export async function getLines(): Promise<Array<string>> {
    return (await readFile(Config.outFile, "utf8")).split("\n");
}

export async function restartContainer(name: string): Promise<void> {
    const container = await Docker.listContainers({ filters: { name: [name] } }).then(list => list[0]);
    if (!container) return;
    const reloadAction = Config.reloadContainerActions[name];
    const shouldReload = !!reloadAction;
    log("group", "%s container %s", shouldReload ? "Applying reload to" : "Restarting", name);
    try {
        if (reloadAction?.action === "kill") {
            log("debug", "Sending %s to %s (%s)", reloadAction.value, name, container.Id);
            await Docker.getContainer(container.Id).kill({ signal: reloadAction.value });
            log("log", "Container %s reloaded via signal %s.", name, reloadAction.value);
            console.groupEnd();
            return;
        }
        if (reloadAction?.action === "exec") {
            await execInContainer(container.Id, reloadAction.value);
            log("log", "Container %s reloaded via exec: %s", name, reloadAction.value);
            console.groupEnd();
            return;
        }
        await Docker.getContainer(container.Id).restart();
        log("log", "Container %s restarted successfully.", name);
    } catch (err) {
        if (shouldReload) {
            log("warn", "Reload action failed for %s: %s; falling back to restart.", name, (err as Error).message);
            try {
                await Docker.getContainer(container.Id).restart();
                log("log", "Container %s restarted successfully after reload failure.", name);
                console.groupEnd();
                return;
            } catch (restartErr) {
                log("error", "Fallback restart failed for container %s: %s", name, (restartErr as Error).message);
                console.groupEnd();
                return;
            }
        }
        log("error", "Failed to restart container %s: %s", name, (err as Error).message);
    }
    console.groupEnd();
}

async function execInContainer(id: string, command: string): Promise<void> {
    const dockerContainer = Docker.getContainer(id);
    const exec = await dockerContainer.exec({
        AttachStderr: true,
        AttachStdout: true,
        Cmd:          ["sh", "-lc", command]
    });
    const stream = await exec.start({});
    await new Promise<void>((resolve, reject) => {
        stream.on("error", reject);
        stream.on("end", () => resolve());
    });
    const result = await exec.inspect();
    if (result.ExitCode !== 0) {
        throw new Error(`exec reload command failed with exit code ${result.ExitCode ?? -1}`);
    }
}

const counterFile = `${Config.dataDir}/serial.counter`;
export async function getSerial(bump = true): Promise<string> {
    const now = new Date();
    const year = now.getUTCFullYear().toString().slice(-2);
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const datePart = `${year}${month}${day}`;

    const counter = await access(counterFile).then(async () => {
        const [date, nStr] = (await readFile(counterFile, "utf8")).trim().split(",");
        if (date !== datePart) return 0;
        let n = parseInt(nStr ?? "0", 10);
        if (isNaN(n) || n < 0) n = 0;
        else if (bump) n += 1;

        return n;
    }, () => 0);
    if (bump) await writeFile(counterFile, `${datePart},${counter}`);
    const serial = `${datePart}${String(counter).padStart(3, "0")}`;
    return serial;
}

export interface BasicContainerInfo {
    hostname: string;
    id: string;
    ip: string;
    name: string;
}

export interface HostDuplicate {
    containers: Array<BasicContainerInfo>;
    hostname: string;
}

export interface ContainerEvent {
    Action: string;
    Actor:  {
        Attributes: Record<string, string>;
        ID:         string;
    };
    Type:   string;
    from:   string;
    id:     string;
    scope: "local";
    status: string;
    time:     number;
    timeNano: number;
}
