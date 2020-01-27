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
import * as minimatch from 'minimatch';
import * as sftpClient from 'ssh2-sftp-client';

var statusBarItem: vscode.StatusBarItem;
var channel = vscode.window.createOutputChannel('fsdeploy Log');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	log("Initializing fsdeploy");

	let cmdMenuOptions = vscode.commands.registerCommand('fsdeploy.menuFunctions', () => {
		let items: vscode.QuickPickItem[] = [];
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


		vscode.window.showQuickPick(items, { matchOnDescription: true, placeHolder: "Choose a fsDeploy command:" }).then((selection: vscode.QuickPickItem) => {
			if (!selection)
				return;
			switch (selection.label) {
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

	let updateStatusBar = function () {
		let workspaceNode = getWorkspaceDeployNodes();
		let fileNode = vscode.window.activeTextEditor ? getFileDeployNodes(vscode.window.activeTextEditor.document.fileName) : [];

		if (workspaceNode.length > 0 && fileNode.length > 0) {
			statusBarItem.text = 'Deploy: $(check)';
			statusBarItem.tooltip = "Workspace has a deployment target";
		} else if (workspaceNode == null && fileNode.length > 0) {
			statusBarItem.text = 'Deploy: $(stop)/$(check)';
			statusBarItem.tooltip = "Workspace doesn't have a deployment target but file is in scope";
		} else if (workspaceNode.length > 0 && fileNode.length <= 0) {
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
		if (sourcePath.toLowerCase().startsWith(getWorkspaceRootPath().toLowerCase())) {
			fsnodes.push(node);
		}
	});

	return fsnodes;
}

// this method is called when your extension is deactivated
export function deactivate() {
	log("  -> fsdeploy deactivated.");
}

async function deploy(filePath: string, notify: boolean = true) {
	return new Promise((resolve, reject) => {
		log(`Deploy file ${filePath}`);

		let nodes: fsConfigNode[] = getFileDeployNodes(filePath);
		let path: string = filePath.substr(0, filePath.lastIndexOf(Path.sep));
		let fileName: string = filePath.substr(filePath.lastIndexOf(Path.sep) + 1);

		if (nodes.length > 0) {
			let origiStatus = statusBarItem.text;
			if (notify) statusBarItem.text = `${origiStatus} deploying '${fileName}'`;

			nodes.forEach(async (node: fsConfigNode) => {
				const sourcePath = getAbsolutePath(node.source);
				let globOpt: object = { dot: true, nocase: true, debug: false };

				if (minimatch(fileName, node.exclude, globOpt) || minimatch(filePath, node.exclude, globOpt)) {
					return false;
				}

				if (minimatch(fileName, node.include, globOpt) || minimatch(filePath, node.include, globOpt)) {
					if (node.scp && node.scp.enabled) {
						let subpath: string = path.substr(sourcePath.length + 1).replace(/\\/g, '/');
						const targetPath = node.target;
						let target: string = `${targetPath}/${subpath}`;

						var config = {
							host: node.scp.host,
							port: node.scp.port,
							username: node.scp.username,
							password: node.scp.password,
							retries: 0
						};
						var sftp = new sftpClient();

						try {
							try {
								await sftp.connect(config);
								await sftp.mkdir(target, true);
								await sftp.fastPut(filePath.replace(/\\/g, '/'), `${target}/${fileName}`);
								resolve();
							} catch (ex) {
								console.log(ex);
								reject();
							} finally {
								await sftp.end();
							}
						} catch (ex) {
							log(`  -> ${ex} on ${target}${Path.sep}${fileName}`);
							vscode.window.showInformationMessage(`Error on deploying ${fileName}. ${ex}`);
							reject();
						}
					} else {
						let subpath: string = path.substr(sourcePath.length);
						const targetPath = getAbsolutePath(node.target);
						let target: string = `${targetPath}${Path.sep}${subpath}`;
						mkdirs(target);

						try {
							fs.writeFileSync(`${target}${Path.sep}${fileName}`, fs.readFileSync(filePath));
							log(`  -> done on ${target}${Path.sep}${fileName}`);
							resolve();
						} catch (ex) {
							log(`  -> ${ex} on ${target}${Path.sep}${fileName}`);
							vscode.window.showInformationMessage(`Error on deploying ${fileName}.\n${ex}`);
							reject();
						}
					}
				}
			});

			if (notify) {
				statusBarItem.text = `${origiStatus} deployed '${fileName}'`;
				setTimeout(() => {
					statusBarItem.text = origiStatus;
				}, 3000);
			}
		} else {
			reject();
		}
	});
};

async function deployWorkspace(): Promise<void> {
	// get the fsdeploy.node mapping for the selected workspace
	// and only pick out the first match if there are multiple
	let fsnodes: fsConfigNode[] = getWorkspaceDeployNodes();

	if (fsnodes.length > 0) {
		let origiStatus = statusBarItem.text;
		statusBarItem.text = `${origiStatus} deploying Workspace`;

		let current_progress = 0;
		let last_progress = 0;

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: "Deploying Workspace"
		}, async (progress, token) => {
			let overall_items = 0;
			let processed_items = 0;

			for (const node of fsnodes) {
				// remove deploy dir
				if (node.deleteTargetOnDeploy) {
					const targetPath = getAbsolutePath(node.target);

					try {
						log(`Delete node target: ${targetPath}`);
						fse.removeSync(targetPath);
					} catch (error) {
						log(`Error on deleting node target: ${targetPath}`);
					}
				}

				var files = await vscode.workspace.findFiles(node.include, node.exclude);
				overall_items += files.length;
				for (const file of files) {
					if (file.scheme == "file") {
						try {
							await deploy(file.fsPath, false);
						} catch (ex) {
							console.log(ex);
						} finally {
							processed_items++;
							current_progress = 100 / overall_items * processed_items;
							if (Math.floor(current_progress) > Math.floor(last_progress)) {
								progress.report({ increment: Math.floor(current_progress) - Math.floor(last_progress), message: `${processed_items} of ${overall_items} files` });
								last_progress = current_progress;
							}
							if (Math.floor(current_progress * 100) % 10 == 0) {
								progress.report({ message: `${processed_items} of ${overall_items} files` });
							}
						}
					}
					if (token.isCancellationRequested) {
						break;
					}
				}
				if (token.isCancellationRequested) {
					break;
				}
			}
			let canceled = token.isCancellationRequested ? '\nThe operation was cancelled by you.' : '';
			statusBarItem.text = `${origiStatus} deployed ${processed_items} of ${overall_items} files in Workspace`;
			vscode.window.showInformationMessage(`Finished deploying ${processed_items} of ${overall_items} files in Workspace. ${canceled}`);
			setTimeout(() => {
				statusBarItem.text = origiStatus;
			}, 3000);
		});

	} else {
		vscode.window.showErrorMessage(`Couldn't find matching deploy rule for '${getWorkspaceRootPath()}'`);
		log(`Couldn't find matching deploy rule for '${getWorkspaceRootPath()}'`)
	}
}

function log(msg: string) {
	channel.appendLine(msg);
	console.log(msg);
}

function getAbsolutePath(relativePath: string): string {
	return Path.resolve(getWorkspaceRootPath(), relativePath).replace(/[\\/]$/g, "");
}

function getWorkspaceRootPath(): string {
	return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: "";
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