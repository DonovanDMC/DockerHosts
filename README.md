# Docker Hosts
Keep your hosts up to date with your docker containers.

Any container names as well as the short id (first 12 digits) will be added to your system's hosts file. By default, the prefix is ".containers.local", this can be changed via a cli option.

Say we have a container named "test", with the id 123456789012
It will recieve the following hosts mapped to its ip address(es):
- test.containers.local
- 123456789012.containers.local

On each run, hosts which were for containers that are no longer present will be removed.

The recommended usage is as a cli command, but inlinne usage is possible. Due to this not being the intended usage method, the only "documentation" is the types on github. 

Use `docker-hosts --help` for cli usage. No arguments are required. Installing globally will provide the easiest usage, but running with `npx` will also work.

## Config
This program looks for a file called `.docker-hosts.json` in the working directory where it's executed. The format of this file is camelCasing (some-option -> someOption). The only minor exception is `stackSuffixes`. While this accepts the cli format (key=value array), you can also provide a direct key-value object instead. All options except config can be provided here. Any command line provided options take presedence. An example config can be found [here](https://github.com/DonovanDMC/DockerHosts/blob/master/.docker-hosts.example.json).

## File Access
On unix systems this MUST either be ran as root, or a user that has access to edit /etc/hosts.

My recommendation:
If using the cli, running as root should be fine.
If using the code directly, running as root should be considered unacceptable, unless in a container, or downgrading to an unprivileged user afterwards. I personally add myself to the `root` group, and chmod /etc/hosts to 664.
If none of the above are fesable, you can change the hosts file to another location, then copy it to `/etc/hosts` with the root user.
