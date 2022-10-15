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
            parsed: lines.slice(startIndex, endIndex).filter(line => line.includes("auto=true")).map(line => ({ [line.replace(/\s+/g, " ").split(" ")[1]]: { ip: line.replace(/\s+/g, " ").split(" ")[0], stack: line.match(/stack=([\w-]+)/)?.[1] ?? null } })).reduce((a, b) => ({ ...a, ...b }), {} as Record<string, { ip: string; stack: string | null; }>),
            startIndex,
            endIndex
        };
    }
    static async write(options: WriteOptions) {
        const { parsed, raw, startIndex } = await this.read(options.path);
        let added = 0, removed = 0, unchanged = 0;
        // eslint-disable-next-line prefer-const
        for (let [dns, { ip, stack }] of Object.entries(parsed)) {
            const originalDNS = dns;
            let suffix: string | undefined;
            suffix = ((stack !== null && (suffix = options.stackSuffixes[stack])) || suffix) ?? options.suffix;
            console.log(stack, stack && options.stackSuffixes[stack], suffix, options.suffix);
            dns = dns.slice(0, -suffix.length);
            if (options.entries[dns] === undefined) {
                if (stack && options.keepStacks.includes(stack)) {
                    debug("Skipping removal for %s%s -> %s, stack (%s) specified in keep list.", dns, suffix, ip, stack);
                    continue;
                }
                debug("Removed: %s%s -> %s", dns, suffix, ip);
                removed++;
                delete parsed[originalDNS];
            }
        }
        // eslint-disable-next-line prefer-const
        for (let [dns, { ip, stack }] of Object.entries(options.entries)) {
            let suffix: string | undefined;
            dns += ((stack !== null && (suffix = options.stackSuffixes[stack])) || suffix) ?? options.suffix;
            console.log(stack, stack && options.stackSuffixes[stack], suffix, options.suffix);
            if (parsed[dns] === undefined) {
                added++;
                parsed[dns] = { ip, stack };
                debug("Added: %s -> %s", dns, ip);
            } else {
                unchanged++;
                debug("Unchanged: %s -> %s", dns, ip);
            }
        }

        const rawLines = raw.slice(0, startIndex - 1);
        if (rawLines.at(startIndex - 1) !== "") rawLines.push("");
        await writeFile(options.path, [...rawLines, "# Start Docker", "", table(Object.entries(parsed).map(([dns, { ip, stack }]) => [ip, dns, `# auto=true${stack === null ? "" : `&stack=${stack}`}`]), { align: ["l", "r", "l"] }), "", "# End Docker", ""].join("\n"));
        (process.env.CLI === "1" ? console.debug : debug)("Write Completed - Added: %d, Removed: %d, Unchanged: %d", added, removed, unchanged);
    }
}

interface WriteOptions {
    entries: Record<string, { ip: string; stack: string | null; }>;
    keepStacks: Array<string>;
    path: string;
    stackSuffixes: Record<string, string>;
    suffix: string;
}
