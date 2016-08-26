'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// 
// use https://octicons.github.com/ glyphs for window icons
// marketplace: https://marketplace.visualstudio.com/items?itemName=mightycoco.fsdeploy
import * as vscode from 'vscode';
import * as fs from 'fs';
var fsext = require('fs-extra');

let statusBarItem: vscode.StatusBarItem = null;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    let cmdMenuOptions = vscode.commands.registerCommand('fsdeploy.menuFunctions', () => {
        let items:vscode.QuickPickItem[] = [];
        let wsnode = getWorkspaceDeployNodes();
        let fpnode = getFileDeployNodes(vscode.window.activeTextEditor.document.fileName);

	    items.push({
            label: "Deploy File", 
            description: "Deploy the currently open file",
            detail: fpnode.length > 0 ? `'${fpnode[0].source.toLowerCase()}' to '${fpnode[0].target.toLowerCase()}'` : null
        });
	    items.push({
            label: "Deploy Workspace", 
            description: "Deploy all files in the current workspace", 
            detail: wsnode != null ? `'${wsnode[0].source.toLowerCase()}' to '${wsnode[0].target.toLowerCase()}'` : null 
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
        deploy(e.fileName);
    });

    let onOpen = vscode.window.onDidChangeActiveTextEditor((e: vscode.TextEditor) => {
        if (!statusBarItem) {
	    	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    		statusBarItem.command = 'fsdeploy.menuFunctions';
            statusBarItem.show();
	    }
        let workspaceNode = getWorkspaceDeployNodes();
        let fileNode = getFileDeployNodes(vscode.window.activeTextEditor.document.fileName);

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
            statusBarItem.tooltip = "Workspace doesn't have a deployment target";
        }
    });

    context.subscriptions.push(onSave);
    context.subscriptions.push(onOpen);
    context.subscriptions.push(cmdDeployFile);
    context.subscriptions.push(cmdDeployWorkspace);
}

function getFileDeployNodes(path: string) : fsConfigNode[] {
    let nodes: fsConfigNode[] = vscode.workspace.getConfiguration('fsdeploy').get("nodes", []);
    let fsnodes: fsConfigNode[] = [];

    nodes.forEach((node: fsConfigNode) => {
        if(path.toLowerCase().startsWith(node.source.toLowerCase())) {
            fsnodes.push(node);
        }
    });

    return fsnodes;
}

function getWorkspaceDeployNodes() : fsConfigNode[] {
    let nodes: fsConfigNode[] = vscode.workspace.getConfiguration('fsdeploy').get("nodes", []);
    let fsnodes: fsConfigNode[] = [];
    nodes.forEach((node: fsConfigNode) => {
        if(node.source.toLowerCase().startsWith(vscode.workspace.rootPath.toLowerCase())) {
            fsnodes.push(node); 
        }
    });

    return fsnodes;
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function deploy(filePath: string) : void {
    let nodes: fsConfigNode[] = getFileDeployNodes(filePath);
    let path: string = filePath.substr(0, filePath.lastIndexOf("\\"));
    let fileName: string = filePath.substr(filePath.lastIndexOf("\\") + 1);

    if(nodes.length > 0) {
        let origiStatus = statusBarItem.text;
        statusBarItem.text = `${origiStatus} deploying '${fileName}'`;

        nodes.forEach((node: fsConfigNode) => {
            let subpath: string = path.substr(node.source.length);
            let target: string = `${node.target}\\${subpath}`;

            mkdirs(target);

            fsext.copySync(filePath, `${target}\\${fileName}`);
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
            statusBarItem.text = `${origiStatus} deploying to '${node.target}'`;
            // find files using a glob include/exclude and deploy accordingly
            vscode.workspace.findFiles(node.include, node.exclude).then((files: vscode.Uri[]) => {
                files.forEach((file) => {
                    if(file.scheme == "file") {
                        let path: string = file.fsPath.substr(0, file.fsPath.lastIndexOf("\\"));
                        let fileName: string = file.fsPath.substr(file.fsPath.lastIndexOf("\\") + 1);
                        let subpath: string = path.substr(node.source.length);
                        let target: string = `${node.target}\\${subpath}`;

                        mkdirs(target);

                        fsext.copySync(file.fsPath, `${target}\\${fileName}`);
                    }
                    vscode.window.showInformationMessage(`Finished deploying '${files.length}' files to ${node.target}.`);
                    statusBarItem.text = `${origiStatus} finished deploying`;
                    setTimeout(() => {
                        statusBarItem.text = origiStatus;
                    }, 3000);
                });
            });
        });
    } else {
        vscode.window.showErrorMessage(`Couldn't find matching deploy rule for '${vscode.workspace.rootPath}'`);
    }
}

function mkdirs(path: string) : void {
    path = path.replace(/\\/g, '/');
    let dirs: string[] = path.split('/');
    let prevDir: string = dirs.splice(0,1)+"/";

    while(dirs.length > 0) {
        let curDir: string = prevDir + dirs.splice(0,1);
        if (! fs.existsSync(curDir) ) {
            fs.mkdirSync(curDir);
        }
        prevDir = curDir + '/';
    }
}