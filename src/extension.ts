import * as vscode from 'vscode';
import { ConfigurationManager } from './managers/ConfigurationManager';
import { CoolifyTreeProvider } from './providers/CoolifyTreeProvider';

export function activate(context: vscode.ExtensionContext) {
  // Initialize managers and providers
  const configManager = new ConfigurationManager(context);
  const treeProvider = new CoolifyTreeProvider(configManager);

  // Set initial configuration state
  updateConfigurationState(configManager);

  // Register the tree data provider
  const treeView = vscode.window.createTreeView('coolify-deployments', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  const configureCommand = vscode.commands.registerCommand(
    'coolify.configure',
    async () => {
      vscode.window.showInformationMessage(
        'Configuration flow yet to be implemented'
      );
    }
  );

  const reconfigureCommand = vscode.commands.registerCommand(
    'coolify.reconfigure',
    async () => {
      const result = await vscode.window.showWarningMessage(
        'This will clear your existing configuration. Do you want to continue?',
        'Yes',
        'No'
      );

      if (result === 'Yes') {
        await configManager.clearConfiguration();
        await updateConfigurationState(configManager);
        treeProvider.refresh();
        await vscode.commands.executeCommand('coolify.configure');
      }
    }
  );

  context.subscriptions.push(treeView, configureCommand, reconfigureCommand);
}

async function updateConfigurationState(
  configManager: ConfigurationManager
): Promise<void> {
  const isConfigured = await configManager.isConfigured();
  await vscode.commands.executeCommand(
    'setContext',
    'coolify.isConfigured',
    isConfigured
  );
}

export function deactivate() {}
