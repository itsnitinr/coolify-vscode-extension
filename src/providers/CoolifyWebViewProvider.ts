import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from '../managers/ConfigurationManager';
import { CoolifyService } from '../services/CoolifyService';

// Types and Interfaces
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

interface WebViewState {
  applications: Application[];
  deployments: Deployment[];
}

interface Application {
  id: string;
  name: string;
  status: string;
  fqdn: string;
  git_repository: string;
  git_branch: string;
  updated_at: string;
}

interface Deployment {
  id: string;
  applicationId: string;
  applicationName: string;
  status: string;
  commit: string;
  startedAt: string;
}

interface WebViewMessage {
  type: 'refresh' | 'deploy' | 'configure' | 'reconfigure';
  applicationId?: string;
}

interface RefreshDataMessage {
  type: 'refresh-data';
  applications: Application[];
  deployments: Deployment[];
}

interface DeploymentStatusMessage {
  type: 'deployment-status';
  status: string;
  applicationId: string;
}

type WebViewOutgoingMessage = RefreshDataMessage | DeploymentStatusMessage;

// Constants
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

const REFRESH_INTERVAL = 5000;

export class CoolifyWebViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private refreshInterval?: NodeJS.Timeout;
  private messageHandler?: vscode.Disposable;
  private retryCount = 0;
  private isDisposed = false;
  private deployingApplications = new Set<string>();
  private pendingRefresh?: NodeJS.Timeout;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private configManager: ConfigurationManager
  ) {
    this.initializeConfigurationListener();
  }

  // Initialization Methods
  private initializeConfigurationListener(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('coolify')) {
          await this.handleConfigurationChange();
        }
      })
    );
  }

  private async handleConfigurationChange(): Promise<void> {
    const isConfigured = await this.configManager.isConfigured();
    if (!isConfigured) {
      this.stopRefreshInterval();
    }
    await this.updateView();
  }

  // View Management Methods
  private isViewValid(): boolean {
    return !!this._view && !this.isDisposed;
  }

  public async updateView(): Promise<void> {
    if (this.pendingRefresh) {
      clearTimeout(this.pendingRefresh);
    }

    this.pendingRefresh = setTimeout(async () => {
      if (!this.isViewValid()) {
        return;
      }

      try {
        this._view!.webview.html = '';
        await this.resolveWebviewView(
          this._view!,
          { state: undefined },
          new vscode.CancellationTokenSource().token
        );
      } catch (error) {
        this.handleError('Failed to update view', error);
      }
    }, 100);
  }

  // Retry Logic
  private async withRetry<T>(
    operation: () => Promise<T>,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === retryConfig.maxAttempts) {
          throw lastError;
        }

        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(2, attempt - 1),
          retryConfig.maxDelay
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  // Refresh Management
  private stopRefreshInterval(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private startRefreshInterval(): void {
    this.stopRefreshInterval();
    this.retryCount = 0;

    this.refreshInterval = setInterval(async () => {
      try {
        await this.refreshData();
        this.retryCount = 0;
      } catch (error) {
        this.retryCount++;
        console.error('Refresh failed:', error);

        if (this.retryCount >= DEFAULT_RETRY_CONFIG.maxAttempts) {
          this.stopRefreshInterval();
          if (this.isViewValid()) {
            vscode.window.showErrorMessage(
              'Auto-refresh stopped due to repeated errors. Click refresh to try again.'
            );
          }
        }
      }
    }, REFRESH_INTERVAL);
  }

  // Data Management
  public async refreshData(): Promise<void> {
    if (!this.isViewValid()) {
      return;
    }

    try {
      await this.withRetry(async () => {
        const serverUrl = await this.configManager.getServerUrl();
        const token = await this.configManager.getToken();

        if (!serverUrl || !token) {
          await this.handleUnconfiguredState();
          return;
        }

        const service = new CoolifyService(serverUrl, token);
        const [applications, deployments] = await Promise.all([
          service.getApplications(),
          service.getDeployments(),
        ]);

        await this.updateWebViewState(applications, deployments);
      });
    } catch (error) {
      await this.handleRefreshError(error);
    }
  }

  private async handleUnconfiguredState(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'coolify.isConfigured',
      false
    );
  }

  private async updateWebViewState(
    applications: any[],
    deployments: any[]
  ): Promise<void> {
    if (!this.isViewValid()) {
      return;
    }

    const uiApplications = this.mapApplicationsToUI(applications);
    const uiDeployments = this.mapDeploymentsToUI(deployments);

    this._view!.webview.postMessage({
      type: 'refresh-data',
      applications: uiApplications,
      deployments: uiDeployments,
    } as WebViewOutgoingMessage);
  }

  private mapApplicationsToUI(applications: any[]): Application[] {
    return applications.map((app) => ({
      id: app.uuid,
      name: app.name,
      status: app.status,
      fqdn: app.fqdn,
      git_repository: app.git_repository,
      git_branch: app.git_branch,
      updated_at: app.updated_at,
    }));
  }

  private mapDeploymentsToUI(deployments: any[]): Deployment[] {
    return deployments.map((d) => ({
      id: d.id,
      applicationId: d.application_id,
      applicationName: d.application_name,
      status: d.status,
      commit:
        d.commit_message ||
        `Deploying ${d.commit?.slice(0, 7) || 'latest'} commit`,
      startedAt: new Date(d.created_at).toLocaleString(),
    }));
  }

  // Deployment Management
  public async deployApplication(applicationId: string): Promise<void> {
    if (this.deployingApplications.has(applicationId)) {
      vscode.window.showInformationMessage('Deployment already in progress');
      return;
    }

    this.deployingApplications.add(applicationId);

    try {
      await this.withRetry(async () => {
        const serverUrl = await this.configManager.getServerUrl();
        const token = await this.configManager.getToken();

        if (!serverUrl || !token) {
          throw new Error('Extension not configured properly');
        }

        const service = new CoolifyService(serverUrl, token);
        await service.startDeployment(applicationId);
      });

      await this.refreshData();

      if (this.isViewValid()) {
        vscode.window.showInformationMessage('Deployment started successfully');
      }
    } catch (error) {
      this.handleError('Failed to start deployment', error);
    } finally {
      this.deployingApplications.delete(applicationId);
    }
  }

  // WebView Resolution
  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.cleanupExistingView();
    this.initializeNewView(webviewView);

    try {
      await this.setupWebView(webviewView);
    } catch (error) {
      this.handleError('Error initializing webview', error);
    }
  }

  private cleanupExistingView(): void {
    if (this.messageHandler) {
      this.messageHandler.dispose();
      this.messageHandler = undefined;
    }
  }

  private initializeNewView(webviewView: vscode.WebviewView): void {
    this.isDisposed = false;
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
      enableCommandUris: false,
    };
  }

  private async setupWebView(webviewView: vscode.WebviewView): Promise<void> {
    this.setupMessageHandler(webviewView);
    this.setupVisibilityHandler(webviewView);
    this.setupDisposalHandler(webviewView);

    const isConfigured = await this.configManager.isConfigured();
    if (!isConfigured) {
      this.handleUnconfiguredWebView(webviewView);
      return;
    }

    await this.initializeConfiguredWebView(webviewView);
  }

  private setupMessageHandler(webviewView: vscode.WebviewView): void {
    this.messageHandler = webviewView.webview.onDidReceiveMessage(
      async (data: WebViewMessage) => {
        if (!this.isViewValid()) {
          return;
        }

        try {
          await this.handleWebViewMessage(data);
        } catch (error) {
          console.error('Error handling webview message:', error);
        }
      }
    );
  }

  private async handleWebViewMessage(message: WebViewMessage): Promise<void> {
    switch (message.type) {
      case 'refresh':
        await this.refreshData();
        break;
      case 'deploy':
        if (message.applicationId) {
          await this.deployApplication(message.applicationId);
        }
        break;
      case 'configure':
        await vscode.commands.executeCommand('coolify.configure');
        break;
      case 'reconfigure':
        await vscode.commands.executeCommand('coolify.reconfigure');
    }
  }

  private setupVisibilityHandler(webviewView: vscode.WebviewView): void {
    this.disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.refreshData().catch(console.error);
          this.startRefreshInterval();
        } else {
          this.stopRefreshInterval();
        }
      })
    );
  }

  private setupDisposalHandler(webviewView: vscode.WebviewView): void {
    this.disposables.push(
      webviewView.onDidDispose(() => {
        this.dispose();
      })
    );
  }

  private async handleUnconfiguredWebView(
    webviewView: vscode.WebviewView
  ): Promise<void> {
    this.stopRefreshInterval();
    if (this.isViewValid()) {
      webviewView.webview.html = await this.getWelcomeHtml();
    }
  }

  private async initializeConfiguredWebView(
    webviewView: vscode.WebviewView
  ): Promise<void> {
    if (this.isViewValid()) {
      webviewView.webview.html = await this.getWebViewHtml();
      if (webviewView.visible) {
        this.startRefreshInterval();
      }
      await this.refreshData();
    }
  }

  // HTML Generation
  private async getWebViewHtml(): Promise<string> {
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'src/templates/webview.html'
    );

    let html = await fs.promises.readFile(htmlPath, 'utf-8');

    return html;
  }

  private async getWelcomeHtml(): Promise<string> {
    const logoUri = this._view?.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'public', 'logo.svg')
    );

    // Load welcome template and replace logo URI
    const welcomePath = vscode.Uri.joinPath(
      this._extensionUri,
      'dist',
      'templates',
      'welcome.html'
    );
    const fileData = await vscode.workspace.fs.readFile(welcomePath);
    let html = Buffer.from(fileData).toString('utf-8');
    html = html.replace('${logoUri}', logoUri?.toString() || '');

    return html;
  }

  // Error Handling
  private handleError(message: string, error: unknown): void {
    console.error(`${message}:`, error);
    if (this.isViewValid()) {
      if (error instanceof Error && error.message.includes('401')) {
        this.handleAuthenticationError();
      } else {
        vscode.window.showErrorMessage(`${message}. Please try again.`);
      }
    }
  }

  private async handleAuthenticationError(): Promise<void> {
    await this.configManager.clearConfiguration();
    await vscode.commands.executeCommand(
      'setContext',
      'coolify.isConfigured',
      false
    );
    if (this.isViewValid()) {
      vscode.window.showErrorMessage(
        'Authentication failed. Please reconfigure the extension.'
      );
    }
  }

  private async handleRefreshError(error: unknown): Promise<void> {
    if (error instanceof Error && error.message.includes('401')) {
      await this.handleAuthenticationError();
    } else {
      if (this.isViewValid()) {
        vscode.window.showErrorMessage(
          'Failed to refresh data. Please try again.'
        );
      }
    }
    throw error;
  }

  public async getApplications() {
    try {
      const serverUrl = await this.configManager.getServerUrl();
      const token = await this.configManager.getToken();

      if (!serverUrl || !token) {
        throw new Error('Extension not configured properly');
      }

      const service = new CoolifyService(serverUrl, token);
      const applications = await service.getApplications();

      return applications.map((app) => ({
        id: app.uuid,
        name: app.name,
        status: app.status,
        label: `${app.name} (${app.git_repository}:${app.git_branch})`,
      }));
    } catch (error) {
      console.error('Failed to get applications:', error);
      throw error;
    }
  }

  // Cleanup
  public dispose(): void {
    this.isDisposed = true;
    this.stopRefreshInterval();

    if (this.pendingRefresh) {
      clearTimeout(this.pendingRefresh);
      this.pendingRefresh = undefined;
    }

    if (this.messageHandler) {
      this.messageHandler.dispose();
      this.messageHandler = undefined;
    }

    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];

    this._view = undefined;
    this.deployingApplications.clear();
  }
}
