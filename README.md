# README

File System Deploy. Auto-deploys a file after saving.

## Features
Define a source and target folder structure to automatically copy a file, which was saved inside the source target structure.

For example if there is a file in your workspace under /usr/code/project/test.js and you have a source defined as /usr/code/project and a target defined as /var/www/html/foo the file test.js will get copied to/var/www/html/foo/test as soon as you hit save or execute the command fsdeploy: Deploy File.



## Extension Settings
> This extension contributes the following settings

* `fsdeploy.nodes`: array of objects containing a source/target set.
* `fsdeploy.deployOnSave`: boolean flag indicating if a file should get immediately deployed when saving. 
* `fsdeploy.deployWorkspaceOnSave`: boolean flag indicating if the complete workspace should get immediately deployed when saving. (Defaults to false.)

> example:

      {
          "fsdeploy.nodes": [
              {
                  "source":"/usr/code/project/",
                  "target":"/var/www/html/foo",
                  "include":"**/*.*",
                  "exclude":"**/min/*.*",
                  "deleteTargetOnDeploy": true,
        				  "scp": {...}
              }
          ],
          "fsdeploy.deployOnSave": true,
          "fsdeploy.deployWorkspaceOnSave": false
      }

- You can have multiple targets for the same source. 
  Just add multiple nodes then with different targets which copy from the same source.
- Adding include/exclude rules in the form of glob patterns


            The pattern to match. e.g. **/*.js to match all JavaScript files 
            or myFolder/** to match that folder with all children.

            Reference:
            * matches 0 or more characters
            ? matches 1 character
            ** matches zero or more directories
            [a-z] matches a range of characters
            {a,b} matches any of the patterns


> example using extended glob:

Let's say you have following source structure
```
- opt
  - usr
    - projects
      - foo
        - templates
          - main.html
        - js
          - main.js
          - tests
            - test.main.js
        - src
          - main.ts
        - build
          - combine.sh
        index.html
```

and want it to end up in following target structre
```
- var
  - www
    - bar
      - templates
        - main.html
      - js
        - main.js
      index.html
```

You would need to create a glob excluding src, build and /tests/:

    {
    "fsdeploy.nodes": [
        {
            "source":"/opt/usr/projects/foo",
            "target":"/var/www/bar",
            "exclude":"**/tests/**",
            "include": "{templates,js}/**/*.*",
            "deleteTargetOnDeploy": true
        }
    }

if the target system in unix, you can use scp to upload to the target. In this case the configuration for a node needs to be extended with the target host information and username/password:
scp {
	host: "hostname",
	port: 22,
	username: "cpuser",
	password: "cppassword"
}

## Known Issues
scp doesn't support certificate authentication. It's recommended to have a user which has only write permissions to the desired remote folder used in the deploy binding. No read is required.
scp doesn't allow deleteTargetOnDeploy right now

## Changelog

### 0.1.12
- minor code restructure
- fix progress bar when deploying entire workspace introduced in 0.1.10

### 0.1.11
- the single file deploy as well as the deployOnSave now considers the include/exclude globe pattern of the deploy binding (https://github.com/mightycoco/fsdeploy/issues/8#issue-484234843)
- minor bug fixes and replacing deprecated API calls

### 0.1.10
- added Remove target-folder before deploy workspace (saschamander)
- minor typo fix
- added deployWorkspaceOnSave functionality. (saschamander)

### 0.1.9
- add scp to upload to unix hosts

### 0.1.7
- minor bug fixes

### 0.1.6
- minor clean ups
- added relative path support from the workspace root. (greggbjensen)

### 0.1.5
- Updating builds and dependencies
- Moving from sync to async copy

### 0.1.3
- Adding configuration to package.json
- Don't remove leading/trailing slashes in pathes when building the effective subpaath

### 0.1.2
- Fixing path issues on non windows environments

### 0.1.1
- Adding configuration to stop auto-deploy on save

### 0.1.0
- Fixing NPE when accessing the status bar
- Fixing multiple issues to bring the extension to a more final stage
- Fixing dependencies

### 0.0.6
- Fixing issues in workspace deployment

### 0.0.5
- Minor fixes

### 0.0.4
- Minor fixes

### 0.0.3

- Added status bar icon whihc indicates if the current workspace has a deployment mapping
- Added status bar functions popping up after a click
- Some code streamlining
- Remove some annoying popup message

### 0.0.2

- Added "Deploy Workspace" command to deploy the entire workspace
- Added include/exclude config
  - Only applies to "Deploy Workspace"

### 0.0.1

- Initial release