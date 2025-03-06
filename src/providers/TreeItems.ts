import * as vscode from 'vscode';
import * as path from 'path';

export class ApplicationItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly status: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `Status: ${status}`;
    this.description = status;

    // Add deploy command
    this.command = {
      command: 'coolify.deployApplication',
      title: 'Deploy',
      arguments: [this],
    };
  }

  contextValue = 'application';
}

export class DeploymentItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly applicationId: string,
    public readonly status: string,
    public readonly createdAt: string
  ) {
    super(`Deployment ${id.slice(0, 8)}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `Status: ${status}\nCreated: ${new Date(
      createdAt
    ).toLocaleString()}`;
    this.description = status;
  }

  contextValue = 'deployment';
}

export class SectionItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly loading: boolean = false
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    if (loading) {
      this.description = '(Loading...)';
    }
  }
}
