import Docker from "dockerode";

export default async function getContainerMap(options?: Docker.DockerOptions, keepPeriods = false) {
    const docker = new Docker(options);
    const containers = await docker.listContainers();
    const map: Record<string, string> = {};
    for (const container of containers) {
        let ipAddress: string | undefined;
        for (const network of Object.values(container.NetworkSettings.Networks)) {
            ipAddress = network.IPAddress;
        }
        if (!ipAddress) {
            console.log("No IP address found for container \"%s\", skipping..", container.Names[0]);
            continue;
        }
        const id = container.Id.slice(0, 12);
        map[id] = ipAddress;
        if (container.Names.length !== 0) {
            for (let name of container.Names) {
                if (!keepPeriods) name = name.replace(/\./g, "-");
                map[name.slice(1)] = ipAddress;
            }
        }
    }
    return map;
}
