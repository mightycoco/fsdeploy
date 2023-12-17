'use strict';

interface fsConfigNode {
    source: string;
    target: string;
    exclude: string;
    include: string;
    notInWorkspace: boolean;
	deleteTargetOnDeploy: boolean;
	deployWorkspaceOnSave: boolean;
    scp: {
      enabled: boolean,
      host: string,
      port: number,
      username: string,
      password: string
    }
}