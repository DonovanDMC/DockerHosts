#!/usr/bin/env node
import { program } from "commander";
import d from "debug";
import { access, readFile } from "fs/promises";
import { platform } from "os";
import getContainerMap from "../dist/getContainerMap.js";
import HostsManager from "../dist/HostsManager.js";
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));


program
    .name("docker-hosts")
    .description("A module to automatically make the system hosts file map to docker ips.")
    .version(pkg.version)
    .option("-h, --hosts-file [string]", "The hosts file to use.", platform() === "win32" ? "C:\\Windows\\System32\\Drivers\\etc\\hosts" : "/etc/hosts")
    .option("--host [string]", "The docker daemon to get the container list from.")
    .option("--socket [string]", "The docker daemon to get the container list from.", "/var/run/docker.sock")
    .option("--suffix [string]", "The suffix for container hostnames.", ".containers.local")
    .option("--stack-suffixes [stack=suffix...]", "This can be used to change the suffix used for specific stacks. Supply in stack=suffix format.", [])
    .option("-d, --debug", "If debug logging should be enabled.", false)
    .option("-s, --silent", "If all output should be silenced.", false)
    .option("--keep-periods", "If periods should be kept in container names. If false, periods will be replaced with dashes. This is useful to control the deepness of domains.", false)
    .option("--keep-stacks [names...]", "The names of stacks to keep hosts for, even if their containers no longer exist.", [])
    .option("--config [path]", "The path to a config file to use. Command line options take presedence.", `${process.cwd()}/.docker-hosts.json`)

await program.parseAsync();
let opt = program.opts();
if(await access(opt.config).then(() => true, () => false)) {
    opt = Object.assign({}, JSON.parse(await readFile(opt.config, "utf8")), opt);
}
if(Array.isArray(opt.stackSuffixes)) {
    opt.stackSuffixes = opt.stackSuffixes.reduce((a, b) => ({ ...a, [b.split("=")[0]]: b.split("=")[1] }), {});
}
const { hostsFile, host, socket, suffix, debug, silent, keepPeriods, keepStacks, stackSuffixes } = opt;
if(debug) d.enable("docker-hosts");
if(!silent) process.env.CLI = "1";
await HostsManager.checkWrite(hostsFile);
const containers = await getContainerMap({ host, socketPath: socket }, keepPeriods);
await HostsManager.write({ entries: containers, keepStacks, path: hostsFile, stackSuffixes, suffix });
