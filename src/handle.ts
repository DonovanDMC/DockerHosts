import { copyFile, writeFile } from "node:fs/promises";

import { render } from "squirrelly";
import { createMarker } from "string-marker";

import Config from "./Config.js";
import {
    type BasicContainerInfo,
    getHosts,
    log,
    type HostDuplicate,
    getLines,
    restartContainer,
    getSerial,
} from "./util.js";

const processing = new Set<string>(), ignoreStopDie = new Set<string>();
const startMarker = "# begin docker-hosts", endMarker = "# end docker-hosts";
export async function handleStart(id: string, hostname: string): Promise<void> {
    if (processing.has(id)) {
        log("warn", "Skipped start for %s", hostname);
    } else {
        processing.add(id);
        log("group", "Got start for %s", hostname);
        try {
            await refresh(id, false);
        } finally {
            console.groupEnd();
            processing.delete(id);
        }
    }
}
export async function handleStop(id: string, hostname: string): Promise<void> {
    if (processing.has(id) || ignoreStopDie.has(id)) {
        log("warn", "Skipped stop for %s", hostname);
    } else {
        processing.add(id);
        log("group", "Got stop for %s", hostname);
        try {
            await refresh(id, true);
        } finally {
            console.groupEnd();
            processing.delete(id);
        }
        ignoreStopDie.add(id);
        setTimeout(() => ignoreStopDie.delete(id), 100);
    }
}
export async function handleDie(id: string, hostname: string): Promise<void> {
    if (processing.has(id) || ignoreStopDie.has(id)) {
        log("warn", "Skipped die for %s", hostname);
    } else {
        processing.add(id);
        log("group", "Got die for %s", hostname);
        try {
            await refresh(id, true);
        } finally {
            console.groupEnd();
            processing.delete(id);
        }
        ignoreStopDie.add(id);
        setTimeout(() => ignoreStopDie.delete(id), 100);
    }
}

export async function refresh(from?: string, remove = false): Promise<number> {
    log("group", "[Refresh] Starting refresh (from=%s, remove=%s)", from ?? "manual", remove);
    const lines = await getLines(),
        containers = await getHosts(),
        duplicateHosts: Array<HostDuplicate> = [],
        seen = new Set<string>(),
        duplicate = new Set<string>();
    log("debug", "[Refresh] Loaded %d existing lines and %d candidate hosts.", lines.length, containers.length);

    if (from && remove && containers.some(c => c.id === from)) {
        const index = containers.findIndex(c => c.id === from);
        if (index !== -1) {
            const [removed] = containers.splice(index, 1);
            log("debug", "[Refresh] Removed source container %s (%s) before write.", removed!.name, removed!.id);
        }
    }

    for (const container of containers) {
        if (duplicate.has(container.hostname)) {
            continue;
        }
        if (seen.has(container.hostname)) {
            duplicate.add(container.hostname);
        } else {
            seen.add(container.hostname);
        }
    }

    for (const host of duplicate) {
        duplicateHosts.push({
            hostname: host,
            containers: containers.filter(c => c.hostname === host),
        });
    }
    if (duplicateHosts.length === 0) {
        log("debug", "[Refresh] No duplicate hostnames detected.");
    }

    for (const dup of duplicateHosts) {
        let container: BasicContainerInfo | undefined, shouldLog = true;
        if (from === undefined || dup.containers.some(c => c.id === from)) {
            log("group", `[Refresh] Duplicate host ${dup.hostname} found on ${dup.containers.length} containers`);

            const hasNumbers = dup.containers.every(c => /-\d+$/.test(c.name));
            if (hasNumbers) {
                log("debug", "[Refresh] Containers seem to be numbered, using highest container.");
                const highest = dup.containers.reduce((prev, curr) => {
                    const num = Number(curr.name.split("-").at(-1));
                    return isNaN(num) ? prev : Math.max(prev, num);
                }, -1);
                container = dup.containers.find(c => c.name.endsWith(`-${highest}`));
                if (container === undefined) {
                    log("error", "Failed to find highest numbered container, using first container.");
                    container = dup.containers[0];
                }
            } else {
                log("warn", "Containers do not seem to be numbered, using first container.");
                container = dup.containers[0];
            }

            if (container === undefined) {
                log("error", "Failed to pick container to assign host.");
            }
        } else {
            // not our concern currently, stick with what's already in use
            container = dup.containers.find(c => lines.some(line => line.includes(c.id)));
            if (container === undefined) {
                log("warn", "Could not determine which container is currently assigned the host, defaulting to first container.");
                container = dup.containers[0];
            }
            shouldLog = false;
        }

        for (const c of dup.containers) {
            if (c.id === container!.id) continue;
            const index = containers.indexOf(c);
            if (index !== -1) {
                containers.splice(index, 1);
                if (shouldLog) {
                    log("debug", "[Refresh] Removed container %S (%s)", c.name, c.id);
                }
            }
        }
        console.groupEnd();
    }

    log("debug", "[Refresh] Backing up output file to %s.bak", Config.outFile);
    await copyFile(Config.outFile, `${Config.outFile}.bak`);
    switch (Config.template) {
        case "hosts":
            log("debug", "[Refresh] Writing hosts template to %s", Config.outFile);
            await writeHosts(containers);
            break;
        default:
            log("debug", "[Refresh] Writing %s template to %s", Config.template, Config.outFile);
            await writeOther(containers);
            break;
    }
    for (const name of Config.applyContainers) {
        await restartContainer(name);
    }
    log("log", "Successfully updated %d hosts.", containers.length);
    console.groupEnd();
    return containers.length;
}

async function writeHosts(containers: Array<BasicContainerInfo>): Promise<void> {
    let maxIPLen = 0, maxHostLen = 0, maxNameLen = 0, maxIdLen = 0;
    for (const { id, hostname: host, ip, name } of containers) {
        maxIPLen = Math.max(maxIPLen, ip.length);
        maxHostLen = Math.max(maxHostLen, host.length);
        maxNameLen = Math.max(maxNameLen, name.length);
        maxIdLen = Math.max(maxIdLen, id.length);
    }

    const newLines = containers.map(({ id, hostname: host, ip, name }) =>
        `${ip.padEnd(maxIPLen)} ${host.padEnd(maxHostLen)} # ${name.padEnd(maxNameLen)} ${id.padEnd(maxIdLen)}`,
    );
    log("debug", "[writeHosts] Writing %d host entries with markers.", newLines.length);
    const marker = createMarker(Config.outFile, startMarker, endMarker);
    await marker.update(newLines);
}

async function writeOther(containers: Array<BasicContainerInfo>): Promise<void> {
    const template = await Config.readTemplate();
    const serial = await getSerial();
    log("debug", "[writeOther] Rendering %s with serial %s (%d containers).", Config.template, serial, containers.length);
    const original = (render(template, { containers, serial }) as string).split("\n");
    const lastSOAIndex = original.findIndex(line => line.includes(")")); // find the end of the SOA record
    const soaLines = original.slice(0, lastSOAIndex + 1);
    // host, IN, A, ip, ;, name, (id)
    const lines = original.filter((line, i) => i > lastSOAIndex).map(line => line.split(/\s+/));
    let longestHost = 0, longestIp = 0;
    for (const line of lines) {
        if (line.length < 4) continue;
        longestHost = Math.max(longestHost, line[0]!.length);
        longestIp = Math.max(longestIp, line[3]!.length);
    }
    const paddedLines = lines.map((line) => {
        if (line.length < 4) return line.join(" ");
        line[0] = line[0]!.padEnd(longestHost);
        if (line.at(4) === ";") line[3] = line[3]!.padEnd(longestIp);
        return line.join(" ");
    });
    const content = [...soaLines, ...paddedLines].join("\n");
    log("debug", "[writeOther] Writing %d lines to %s", soaLines.length + paddedLines.length, Config.outFile);
    await writeFile(Config.outFile, content);
}
