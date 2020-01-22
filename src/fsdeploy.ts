'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// 
// use https://octicons.github.com/ glyphs for window icons
// marketplace: https://marketplace.visualstudio.com/items?itemName=mightycoco.fsdeploy
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as Path from 'path';

var statusBarItem: vscode.StatusBarItem;
var channel = vscode.window.createOutputChannel('fsdeploy Log');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	log("Initializing fsdeploy");
    
    let cmdMenuOptions = vscode.commands.registerCommand('fsdeploy.menuFunctions', () => {
        let items:vscode.QuickPickItem[] = [];
        let wsnode = getWorkspaceDeployNodes();
        let fpnode = vscode.window.activeTextEditor ? getFileDeployNodes(vscode.window.activeTextEditor.document.fileName) : [];

	    items.push({
            label: "Deploy File", 
            description: "Deploy the currently open file",
            detail: fpnode.length > 0 ? `'${fpnode[0].source.toLowerCase()}' to '${fpnode[0].target.toLowerCase()}'` : null
        });
	    items.push({
            label: "Deploy Workspace", 
            description: "Deploy all files in the current workspace", 
            detail: wsnode.length > 0 ? `'${wsnode[0].source.toLowerCase()}' to '${wsnode[0].target.toLowerCase()}'` : null 
        });


        vscode.window.showQuickPick(items, {matchOnDescription: true, placeHolder: "Choose a fsDeploy command:"}).then((selection:vscode.QuickPickItem) => {
            if(!selection) 
                return;
            switch(selection.label) {
                case "Deploy File":
                    deploy(vscode.window.activeTextEditor.document.fileName);
                    break;
                case "Deploy Workspace":
                    deployWorkspace();
                    break;
            }
        });
    });

    let cmdDeployFile = vscode.commands.registerCommand('fsdeploy.deployFile', () => {
        deploy(vscode.window.activeTextEditor.document.fileName);
    });

    let cmdDeployWorkspace = vscode.commands.registerCommand('fsdeploy.deployWorkspace', () => {
        deployWorkspace();
    });

    let onSave = vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
        let deployOnSave = vscode.workspace.getConfiguration('fsdeploy').get("deployOnSave", true);
        let deployWorkspaceOnSave = vscode.workspace.getConfiguration('fsdeploy').get("deployWorkspaceOnSave", true);

        if (deployWorkspaceOnSave) {
            deployWorkspace();
        } else if (deployOnSave) {
            deploy(e.fileName);
        }
    });

    let onOpen = vscode.window.onDidChangeActiveTextEditor((e: vscode.TextEditor) => {
        updateStatusBar();
    });

    let updateStatusBar = function() {
        let workspaceNode = getWorkspaceDeployNodes();
        let fileNode = vscode.window.activeTextEditor ? getFileDeployNodes(vscode.window.activeTextEditor.document.fileName) : [];	

        if(workspaceNode.length > 0 && fileNode.length > 0) {
            statusBarItem.text = 'Deploy: $(check)';
            statusBarItem.tooltip = "Workspace has a deployment target";
        } else if(workspaceNode == null && fileNode.length > 0) {
            statusBarItem.text = 'Deploy: $(stop)/$(check)';
            statusBarItem.tooltip = "Workspace doesn't have a deployment target but file is in scope";
        } else if(workspaceNode.length > 0 && fileNode.length <= 0) {
            statusBarItem.text = 'Deploy: $(check)/$(stop)';
            statusBarItem.tooltip = "Workspace has a deployment target but file isn't in scope";
        } else {
            statusBarItem.text = 'Deploy: $(stop)';
            statusBarItem.tooltip = "Workspace and current file don't have any deployment targets";
        }
    }

    context.subscriptions.push(onSave);
    context.subscriptions.push(onOpen);
    //context.subscriptions.push(cmdDeployFile);
    //context.subscriptions.push(cmdDeployWorkspace);
    //context.subscriptions.push(cmdMenuOptions);

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE);
    statusBarItem.command = 'fsdeploy.menuFunctions';
    statusBarItem.show();

    updateStatusBar();
    log("  -> fsdeploy activated.");
}

function getFileDeployNodes(path: string): fsConfigNode[] {
	let nodes: fsConfigNode[] = vscode.workspace.getConfiguration('fsdeploy').get("nodes", []);
	let fsnodes: fsConfigNode[] = [];

	nodes.forEach((node: fsConfigNode) => {
		const sourcePath = getAbsolutePath(node.source);
		if (path.toLowerCase().startsWith(sourcePath.toLowerCase())) {
			fsnodes.push(node);
		}
	});

	return fsnodes;
}

function getWorkspaceDeployNodes(): fsConfigNode[] {
	let nodes: fsConfigNode[] = vscode.workspace.getConfiguration('fsdeploy').get("nodes", []);
	let fsnodes: fsConfigNode[] = [];
	nodes.forEach((node: fsConfigNode) => {
		const sourcePath = getAbsolutePath(node.source);
		if (sourcePath.toLowerCase().startsWith(vscode.workspace.rootPath.toLowerCase())) {
			fsnodes.push(node);
		}
	});

	return fsnodes;
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function deploy(filePath: string): void {
	log(`Deploy file ${filePath}`);

	let nodes: fsConfigNode[] = getFileDeployNodes(filePath);
	let path: string = filePath.substr(0, filePath.lastIndexOf(Path.sep));
	let fileName: string = filePath.substr(filePath.lastIndexOf(Path.sep) + 1);

	if (nodes.length > 0) {
		let origiStatus = statusBarItem.text;
		statusBarItem.text = `${origiStatus} deploying '${fileName}'`;

		nodes.forEach((node: fsConfigNode) => {
			const sourcePath = getAbsolutePath(node.source);

			if (node.scp && node.scp.enabled) {
				let subpath: string = path.substr(sourcePath.length + 1).replace(/\\/g, '/');
				const targetPath = node.target;
				let target: string = `${targetPath}/${subpath}`;

				var Client = require('ssh2-sftp-client');
				var config = {
					host: node.scp.host,
					port: node.scp.port,
					username: node.scp.username,
					password: node.scp.password
				};
				var sftp = new Client();

				let data = fs.createReadStream(filePath);

				sftp.connect(config)
					.then(() => {
						sftp.mkdir(target, true);
						var promise = sftp.put(data, `${target}/${fileName}`);
						log(`  -> done on ${target}${Path.sep}${fileName}`);
						return promise;
					})
					.then(() => {
						return sftp.end();
					})
					.catch(err => {
						log(`  -> ERROR ${err} on ${target}${Path.sep}${fileName}`);
					});
			} else {
				let subpath: string = path.substr(sourcePath.length);
				const targetPath = getAbsolutePath(node.target);
				let target: string = `${targetPath}${Path.sep}${subpath}`;
				mkdirs(target);

				try {
					fs.writeFileSync(`${target}${Path.sep}${fileName}`, fs.readFileSync(filePath));
					//fse.copySync(filePath, `${target}${Path.sep}${fileName}`, {"overwrite":true, "preserveTimestamps": false});
					log(`  -> done on ${target}${Path.sep}${fileName}`);
				} catch (ex) {
					log(`  -> ERROR ${ex} on ${target}${Path.sep}${fileName}`);
				}
			}
		});

		statusBarItem.text = `${origiStatus} deployed '${fileName}'`;
		setTimeout(() => {
			statusBarItem.text = origiStatus;
		}, 3000);
	}
};

function deployWorkspace() : void {
    // get the fsdeploy.node mapping for the selected workspace
    // and only pick out the first match if there are multiple
    let fsnodes: fsConfigNode[] = getWorkspaceDeployNodes();

    let origiStatus = statusBarItem.text;

    if(fsnodes.length > 0) {
        fsnodes.forEach(function(node) {
            const targetPath = getAbsolutePath(node.target);

            // remove deploy dir
            if(node.deleteTargetOnDeploy){
                  try {
                    log(`Delete node target: ${targetPath}`);
                    fse.removeSync(targetPath);    
                  } catch (error) {
                    log(`Error on deleting node target: ${targetPath}`);
                  }                 
            }

            statusBarItem.text = `${origiStatus} deploying to '${targetPath}'`;
            // find files using a glob include/exclude and deploy accordingly
            vscode.workspace.findFiles(node.include, node.exclude).then((files: vscode.Uri[]) => {
                files.forEach((file) => {
                    if(file.scheme == "file") {
						log(`Deploy file ${file.fsPath}`);
						let path: string = file.fsPath.substr(0, file.fsPath.lastIndexOf(Path.sep));
						let fileName: string = file.fsPath.substr(file.fsPath.lastIndexOf(Path.sep) + 1);
						const sourcePath = getAbsolutePath(node.source);
						let subpath: string = path.substr(sourcePath.length).replace(/^(\/|\\)|(\/|\\)$/g, '');
						let target: string = `${targetPath}${Path.sep}${subpath}`;

						mkdirs(target);

						try {
							fs.writeFileSync(`${target}${Path.sep}${fileName}`, fs.readFileSync(file.fsPath));
							//fse.copySync(file.fsPath, `${target}${Path.sep}${fileName}`, {"overwrite":true, "preserveTimestamps": false});
							log(`  -> done on ${target}${Path.sep}${fileName}`);
						} catch (ex) {
							log(`  -> !ERROR ${ex} on ${target}${Path.sep}${fileName}`);
						}
					}
					vscode.window.showInformationMessage(`Finished deploying '${files.length}' files to ${targetPath}.`);
					statusBarItem.text = `${origiStatus} finished deploying`;
					setTimeout(() => {
						statusBarItem.text = origiStatus;
					}, 3000);
				});
			});
		});
	} else {
		vscode.window.showErrorMessage(`Couldn't find matching deploy rule for '${vscode.workspace.rootPath}'`);
		log(`ERROR: Couldn't find matching deploy rule for '${vscode.workspace.rootPath}'`)
	}
}

function log(msg: string) {
	channel.appendLine(msg);
	console.log(msg);
}

function getAbsolutePath(relativePath: string): string {
	return Path.resolve(vscode.workspace.rootPath, relativePath).replace(/[\\/]$/g, "");
}

function mkdirs(path: string): void {
	path = path.replace(/${fspath.sep}/g, Path.sep);
	let dirs: string[] = path.split(Path.sep);
	let prevDir: string = dirs.splice(0, 1) + Path.sep;

	while (dirs.length > 0) {
		let curDir: string = prevDir + dirs.splice(0, 1);
		if (!fse.existsSync(curDir)) {
			fse.mkdirSync(curDir);
		}
		prevDir = curDir + Path.sep;
	}
}