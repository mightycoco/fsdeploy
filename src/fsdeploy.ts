'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// 
// use https://octicons.github.com/ glyphs for window icons
// marketplace: https://marketplace.visualstudio.com/items?itemName=mightycoco.fsdeploy
import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as fspath from 'path';

let statusBarItem: vscode.StatusBarItem = null;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    console.log("activating fsdeploy...");
    
    let cmdMenuOptions = vscode.commands.registerCommand('fsdeploy.menuFunctions', () => {
        let items:vscode.QuickPickItem[] = [];
        let wsnode = getWorkspaceDeployNodes();
        let fpnode = vscode.window.activeTextEditor ? getFileDeployNodes(vscode.window.activeTextEditor.document.fileName) : [];
        console.log(wsnode, fpnode);

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
        
        console.log(3);


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
        if(deployOnSave) {
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

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.command = 'fsdeploy.menuFunctions';
    statusBarItem.show();

    updateStatusBar();
    console.log("fsdeploy activated.");
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
    let path: string = filePath.substr(0, filePath.lastIndexOf(fspath.sep));
    let fileName: string = filePath.substr(filePath.lastIndexOf(fspath.sep) + 1);

    if(nodes.length > 0) {
        let origiStatus = statusBarItem.text;
        statusBarItem.text = `${origiStatus} deploying '${fileName}'`;

        nodes.forEach((node: fsConfigNode) => {
            let subpath: string = path.substr(node.source.length);
            let target: string = `${node.target}${fspath.sep}${subpath}`;

            mkdirs(target);

            fs.copySync(filePath, `${target}${fspath.sep}${fileName}`);
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
                        let path: string = file.fsPath.substr(0, file.fsPath.lastIndexOf(fspath.sep));
                        let fileName: string = file.fsPath.substr(file.fsPath.lastIndexOf(fspath.sep) + 1);
                        let subpath: string = path.substr(node.source.length);
                        let target: string = `${node.target}${fspath.sep}${subpath}`;

                        mkdirs(target);

                        fs.copySync(file.fsPath, `${target}${fspath.sep}${fileName}`);
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
    path = path.replace(/${fspath.sep}/g, fspath.sep);
    let dirs: string[] = path.split(fspath.sep);
    let prevDir: string = dirs.splice(0,1)+fspath.sep;

    while(dirs.length > 0) {
        let curDir: string = prevDir + dirs.splice(0,1);
        if (! fs.existsSync(curDir) ) {
            fs.mkdirSync(curDir);
        }
        prevDir = curDir + fspath.sep;
    }
}