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
            parsed: lines.slice(startIndex, endIndex).filter(line => line.includes("# automatically generated")).map(line => ({ [line.replace(/\s+/g, " ").split(" ")[1]]: line.replace(/\s+/g, " ").split(" ")[0] })).reduce((a, b) => ({ ...a, ...b }), {} as Record<string, string>),
            startIndex,
            endIndex
        };
    }
    static async write(path: string, suffix: string, entries: Record<string, string>) {
        const { parsed, raw, startIndex } = await this.read(path);
        let added = 0, removed = 0, unchanged = 0;
        // eslint-disable-next-line prefer-const
        for (let [dns, ip] of Object.entries(parsed)) {
            const originalDNS = dns;
            dns = dns.slice(0, -suffix.length);
            if (entries[dns] === undefined) {
                debug("Removed: %s%s -> %s", dns, suffix, ip);
                removed++;
                delete parsed[originalDNS];
            }
        }
        // eslint-disable-next-line prefer-const
        for (let [dns, ip] of Object.entries(entries)) {
            dns += suffix;
            if (parsed[dns] === undefined) {
                added++;
                parsed[dns] = ip;
                debug("Added: %s -> %s", dns, ip);
            } else {
                unchanged++;
                debug("Unchanged: %s -> %s", dns, ip);
            }
        }

        const rawLines = raw.slice(0, startIndex - 1);
        if (rawLines.at(startIndex - 1) !== "") rawLines.push("");
        await writeFile(path, [...rawLines, "# Start Docker", "", table(Object.entries(parsed).map(([dns, ip]) => [ip, dns, "# automatically generated"]), { align: ["l", "c", "r"] }), "", "# End Docker", ""].join("\n"));
        (process.env.CLI === "1" ? console.debug : debug)("Write Completed - Added: %d, Removed: %d, Unchanged: %d", added, removed, unchanged);
    }
}
