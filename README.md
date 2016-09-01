# README

File System Deploy. Auto-deploys a file after saving.

## Features
Define a source and target folder structure to automatically copy a file, which was saved inside the source target structure.

For example if there is a file in your workspace under /usr/code/project/test.js and you have a source defined as /usr/code/project and a target defined as /var/www/html/foo the file test.js will get copied to/var/www/html/foo/test as soon as you hit save or execute the command fsdeploy: Deploy File.



## Extension Settings
> This extension contributes the following settings

* `fsdeploy.nodes`: array of objects containing a source/target set.
* `fsdeploy.deployOnSave`: boolean flag indicating if a file should get immeadiately deployed when saving. (Defaults to true.)

> example:

      {
          "fsdeploy.nodes": [
              {
                  "source":"/usr/code/project/",
                  "target":"/var/www/html/foo",
                  "include":"**/*.*",
                  "exclude":"**/min/*.*"
              }
          ],
          "fsdeploy.deployOnSave": true
      }

- You can have multiple targets for the same source. 
  Just add multiple nodes then with different targetts which copy from the same source.
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
            "include": "{templates,js}/**/*.*"
        }
    }

## Known Issues
none

## Changelog

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