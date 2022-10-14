#!/usr/bin/env node
import { program } from "commander";
import d from "debug";
import { readFile } from "fs/promises";
import { platform } from "os";
import getContainerMap from "../dist/getContainerMap.js";
import HostsManager from "../dist/HostsManager.js";
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));


program
    .name("docker-hosts")
    .description("A module to automatically make the system hosts file map to docker ips.")
    .version(pkg.version)
    .option("-h, --hosts-file [string]", "The hosts file to use. Defaults to the os specific location.", platform() === "win32" ? "C:\\Windows\\System32\\Drivers\\etc\\hosts" : "/etc/hosts")
    .option("--host [string]", "The docker daemon to get the container list from.")
    .option("--socket [string]", "The docker daemon to get the container list from.", "/var/run/docker.sock")
    .option("--suffix [string]", "The suffix for container hostnames.", ".containers.local")
    .option("-d, --debug [boolean]", "If debug logging should be enabled.", false)
    .option("-s, --silent [boolean]", "If all output should be silenced.", false)
    .option("--keep-periods [boolean]", "If periods should be kept in container names. If false, periods will be replaced with dashes. This is useful to control the deepness of domains.", false)

await program.parseAsync();
const { hostsFile, host, socket, suffix, debug, silent, keepPeriods } = program.opts();
if(debug) d.enable("docker-hosts");
if(!silent) process.env.CLI = "1";
await HostsManager.checkWrite(hostsFile);
const containers = await getContainerMap({ host, socketPath: socket }, keepPeriods);
await HostsManager.write(hostsFile, suffix, containers);
