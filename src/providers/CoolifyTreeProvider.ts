import * as vscode from 'vscode';
import { ConfigurationManager } from '../managers/ConfigurationManager';

export class CoolifyTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private configManager: ConfigurationManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    const isConfigured = await this.configManager.isConfigured();
    if (!isConfigured) {
      return []; // Return empty array to show viewsWelcome content
    }

    const loadingItem = new vscode.TreeItem('Loading deployments...');
    return [loadingItem];
  }
}
