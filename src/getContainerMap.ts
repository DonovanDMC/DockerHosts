import Docker from "dockerode";

export interface GetContainerMapOptions {
    docker?: Docker.DockerOptions;
    includeIDs?: boolean;
}
export type ContainerMap = Record<string, ContainerInfo>;
export interface ContainerInfo {
    id: boolean;
    ip: string;
    stack: string | null;
}
export default async function getContainerMap(options?: GetContainerMapOptions) {
    options = options ?? {};
    if (options.includeIDs === undefined) options.includeIDs = false;
    const docker = new Docker(options.docker);
    const containers = await docker.listContainers();
    const map: ContainerMap = {};
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
        if (options.includeIDs) {
            map[id] = { id: true, ip: ipAddress, stack: container.Labels["com.docker.compose.project"] ?? null };
        }
        if (container.Names.length !== 0) {
            for (const name of container.Names) {
                map[name.slice(1)] = { id: false, ip: ipAddress, stack: container.Labels["com.docker.compose.project"] ?? null };
            }
        }
    }
    return map;
}
