import type { ContainerMap } from "./getContainerMap";
import table from "text-table";
import Debug from "debug";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

const debug = Debug("docker-hosts");
export default class HostsManager {
    static async checkWrite(path: string) {
        try {
            await access(path, constants.O_RDWR);
        } catch (err) {
            throw new Error(`R/W check on ${path} failed.`, { cause: err });
        }
    }

    static async read(path: string) {
        await HostsManager.checkWrite(path);
        let lines = (await readFile(path, "utf8")).split("\n");
        let startIndex = lines.indexOf("# Start Docker");
        let endIndex = lines.indexOf("# End Docker");
        if (startIndex === -1) {
            if (lines.at(-1) !== "") lines.push("");
            startIndex = lines.length;
            endIndex = lines.length + 3;
            await writeFile(path, (lines = [...lines, "# Start Docker", "", "", "# End Docker"]).join("\n"));
            debug("Docker header is missing in hosts file, assuming uninitialized configuration.");
        } else if (endIndex === -1) {
            throw new Error("Docker header found, but footer absent. Assuming broken configuration, not continuing.");
        }
        return {
            raw:    lines,
            parsed: lines.slice(startIndex, endIndex).filter(line => line.includes("auto=true")).map(line => ({ [line.replace(/\s+/g, " ").split(" ")[1]]: { ip: line.replace(/\s+/g, " ").split(" ")[0], stack: line.match(/stack=([\w-]+)/)?.[1] ?? null, suffix: line.match(/suffix=([^&]+)/)?.[1] ?? null, id: line.match(/id=(true|false)/)?.[1] === "true", name: line.match(/name=([^&]+)/)?.[1] ?? line.replace(/\s+/g, "").split(" ")[1].split(".")[0] } })).reduce((a, b) => ({ ...a, ...b }), {} as Record<string, HostMetadata>),
            startIndex,
            endIndex
        };
    }
    static async write(options: WriteOptions) {
        const { parsed, raw, startIndex } = await this.read(options.path);
        let added = 0, removed = 0, unchanged = 0, skipped = 0;
        // eslint-disable-next-line prefer-const
        for (let [dns, { id, ip, name, stack, suffix }] of Object.entries(parsed)) {
            const containerHost = options.containerHosts[name];
            if (containerHost) {
                if (dns !== containerHost) {
                    debug("Found out of place host for %s -> %s, did not find expected host (%s). Assuming host was changed, removing..", dns, ip, containerHost);
                    debug("Removed: %s -> %s", dns, ip);
                    removed++;
                    delete parsed[dns];
                    continue;
                }
            } else {
                if (id && options.removeIDContainers) {
                    debug("Found id host %s -> %s, while id hosts are disabled. Assuming configuration change, removing..", dns, ip);
                    debug("Removed: %s -> %s", dns, ip);
                    removed++;
                    delete parsed[dns];
                    continue;
                }
                const stackSuffix = stack === null ? null : options.stackSuffixes[stack] ?? null;
                if (stackSuffix && suffix !== stackSuffix) {
                    debug("Found out of place host for %s -> %s, did not find expected suffix (%s). Assuming suffix was changed, removing..", dns, ip, stackSuffix);
                    debug("Removed: %s -> %s", dns, ip);
                    removed++;
                    delete parsed[dns];
                    continue;
                }
                if (suffix === null) {
                    suffix = ((stack !== null && (suffix = options.stackSuffixes[stack])) || suffix) ?? options.suffix;
                }
            }
            if (options.entries[name] === undefined) {
                if (stack && options.keepStacks.includes(stack)) {
                    debug("Skipping removal for %s -> %s, stack (%s) specified in keep list.", dns, ip, stack);
                    skipped++;
                    continue;
                }
                debug("Removed: %s -> %s", dns, ip);
                removed++;
                delete parsed[dns];
            }
        }
        // eslint-disable-next-line prefer-const
        for (let [name, { id, ip, stack }] of Object.entries(options.entries)) {
            const containerHost = options.containerHosts[name];
            const stackSuffix = stack === null ?  null : options.stackSuffixes[stack] ?? null;
            let suffix: string | undefined;
            let n = name;
            if (!options.keepPeriods) n = n.replace(/\./g, "-");
            const dns = containerHost ?? `${n}${(suffix = stackSuffix ?? options.suffix)}`;
            if (parsed[dns] === undefined) {
                added++;
                parsed[dns] = { id, ip, stack, suffix: suffix ?? null, name };
                debug("Added: %s -> %s", dns, ip);
            } else {
                unchanged++;
                debug("Unchanged: %s -> %s", dns, ip);
            }
        }

        const rawLines = raw.slice(0, startIndex - 1);
        if (rawLines.at(startIndex - 1) !== "") rawLines.push("");
        await writeFile(options.path, [...rawLines, "# Start Docker", "", table(Object.entries(parsed).map(([dns, { id, ip, name, stack, suffix }]) => [ip, dns, `# auto=true&name=${name}${stack === null ? "" : `&stack=${stack}`}${suffix === null ? "" : `&suffix=${suffix}&id=${id ? "true" : "false"}`}`]), { align: ["l", "l", "l"] }), "", "# End Docker", ""].join("\n"));
        (process.env.CLI === "1" ? console.debug : debug)("Write Completed - Added: %d - Removed: %d - Unchanged: %d - Skipped: %d", added, removed, unchanged, skipped);
    }
}

export interface WriteOptions {
    containerHosts: Record<string, string>;
    entries: ContainerMap;
    keepPeriods: boolean;
    keepStacks: Array<string>;
    path: string;
    removeIDContainers: boolean;
    stackSuffixes: Record<string, string>;
    suffix: string;
}

export interface HostMetadata {
    id: boolean;
    ip: string;
    name: string;
    stack: string | null;
    suffix: string | null;
}
