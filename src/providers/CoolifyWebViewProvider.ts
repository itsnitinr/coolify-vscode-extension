import * as vscode from 'vscode';
import { ConfigurationManager } from '../managers/ConfigurationManager';
import { CoolifyService } from '../services/CoolifyService';

export class CoolifyWebViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private refreshInterval?: NodeJS.Timeout;
  private messageHandler?: vscode.Disposable;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private configManager: ConfigurationManager
  ) {}

  public updateView() {
    if (this._view) {
      this._view.webview.html = '';
      this.resolveWebviewView(
        this._view,
        { state: undefined },
        new vscode.CancellationTokenSource().token
      );
    }
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    // Clean up any existing message handler
    if (this.messageHandler) {
      this.messageHandler.dispose();
      this.messageHandler = undefined;
    }

    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Handle messages from the webview
    this.messageHandler = webviewView.webview.onDidReceiveMessage(
      async (data) => {
        switch (data.type) {
          case 'refresh':
            await this.refreshData();
            break;
          case 'deploy':
            await this.deployApplication(data.applicationId);
            break;
          case 'configure':
            await vscode.commands.executeCommand('coolify.configure');
            break;
        }
      }
    );

    // Check if extension is configured before proceeding
    const isConfigured = await this.configManager.isConfigured();
    if (!isConfigured) {
      // Clean up any existing refresh interval
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = undefined;
      }
      // Show welcome message in webview
      webviewView.webview.html = this._getWelcomeHtml();
      return;
    }

    webviewView.webview.html = this._getHtmlForWebview();

    // Start auto-refresh for deployments
    this.startDeploymentRefresh();

    // Initial data load
    this.refreshData();
  }

  public async refreshData() {
    try {
      const serverUrl = await this.configManager.getServerUrl();
      const token = await this.configManager.getToken();

      if (!serverUrl || !token) {
        return;
      }

      const service = new CoolifyService(serverUrl, token);
      const [applications, deployments] = await Promise.all([
        service.getApplications(),
        service.getDeployments(),
      ]);

      // Filter and transform data for UI
      const uiApplications = applications.map((app) => ({
        id: app.uuid,
        name: app.name,
        status: app.status,
        fqdn: app.fqdn,
        git_repository: app.git_repository,
        git_branch: app.git_branch,
        updated_at: app.updated_at,
      }));

      const uiDeployments = deployments.map((d) => ({
        id: d.id,
        applicationId: d.application_id,
        applicationName: d.application_name,
        status: d.status,
        commit:
          d.commit_message ||
          `Deploying ${d.commit?.slice(0, 7) || 'latest'} commit`,
        startedAt: new Date(d.created_at).toLocaleString(),
      }));

      // Send data to webview
      if (this._view) {
        this._view.webview.postMessage({
          type: 'refresh-data',
          applications: uiApplications,
          deployments: uiDeployments,
        });
      }
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  }

  private async deployApplication(applicationId: string) {
    try {
      const serverUrl = await this.configManager.getServerUrl();
      const token = await this.configManager.getToken();

      if (!serverUrl || !token) {
        throw new Error('Extension not configured properly');
      }

      const service = new CoolifyService(serverUrl, token);
      await service.startDeployment(applicationId);

      // Refresh data to show new deployment
      await this.refreshData();

      vscode.window.showInformationMessage('Deployment started successfully');
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error ? error.message : 'Failed to start deployment'
      );
    }
  }

  private startDeploymentRefresh() {
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.refreshData();
      }, 5000);
    }
  }

  private _getHtmlForWebview() {
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .section {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .section-header {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border-bottom: 1px solid var(--vscode-widget-border);
                    flex-wrap: wrap;
                    gap: 12px;
                }
                .section-header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--vscode-foreground);
                }
                .refresh-button {
                    padding: 4px 8px;
                    background: transparent;
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-button-background);
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .refresh-button:hover {
                    background: var(--vscode-button-background);
                }
                .cards-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .card {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 8px;
                    padding: 12px;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .card-main {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .card-title {
                    font-weight: 600;
                    font-size: 14px;
                    color: var(--vscode-editor-foreground);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .card-subtitle {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .card-content {
                    display: grid;
                    grid-template-columns: minmax(80px, auto) 1fr;
                    gap: 6px 12px;
                    font-size: 12px;
                }
                .card-footer {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 8px;
                    border-top: 1px solid var(--vscode-widget-border);
                }
                .label {
                    color: var(--vscode-descriptionForeground);
                    white-space: nowrap;
                }
                .value {
                    color: var(--vscode-foreground);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    min-width: 0;
                }
                .status {
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    white-space: nowrap;
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .deployment-status {
                    animation: pulse 2s infinite;
                    background: var(--vscode-statusBarItem-warningBackground);
                    color: var(--vscode-statusBarItem-warningForeground);
                }
                .deployment-card {
                    position: relative;
                    border-left: 4px solid var(--vscode-statusBarItem-warningBackground);
                }
                .deployment-time {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .commit-message {
                    font-size: 12px;
                    color: var(--vscode-foreground);
                    line-height: 1.4;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .deploy-button {
                    padding: 4px 12px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    white-space: nowrap;
                }
                .deploy-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
                .loading-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--vscode-widget-border);
                    border-top-color: var(--vscode-button-background);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                .refresh-button {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .refresh-button.refreshing {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                .empty {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                @keyframes progress {
                    0% { width: 0; }
                    100% { width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="section">
                <div class="section-header">
                    <h3>Applications</h3>
                    <button class="refresh-button" id="refresh-button" onclick="refreshData()">
                        <span>↻ Force Refresh</span>
                    </button>
                </div>
                <div id="applications" class="cards-container">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Loading applications...
                    </div>
                </div>
            </div>
            
            <div class="section">
                <div class="section-header">
                    <h3>Active Deployments</h3>
                </div>
                <div id="deployments" class="cards-container">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Loading deployments...
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let isRefreshing = false;

                // Restore previous state
                const previousState = vscode.getState();
                if (previousState) {
                    updateUI(previousState.applications, previousState.deployments);
                }

                function refreshData() {
                    if (isRefreshing) return;
                    
                    isRefreshing = true;
                    const indicator = document.getElementById('refresh-indicator');
                    const button = document.getElementById('refresh-button');
                    
                    indicator.style.display = 'block';
                    button.classList.add('refreshing');
                    button.disabled = true;
                    
                    vscode.postMessage({ type: 'refresh' });
                }

                function deployApplication(applicationId) {
                    vscode.postMessage({ type: 'deploy', applicationId });
                }

                function formatDate(dateString) {
                    return new Date(dateString).toLocaleString();
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'refresh-data':
                            vscode.setState({ 
                                applications: message.applications, 
                                deployments: message.deployments 
                            });
                            updateUI(message.applications, message.deployments);
                            isRefreshing = false;
                            const indicator = document.getElementById('refresh-indicator');
                            const button = document.getElementById('refresh-button');
                            indicator.style.display = 'none';
                            button.classList.remove('refreshing');
                            button.disabled = false;
                            break;
                        case 'deployment-status':
                            if (message.status === 'failed') {
                                deployingApps.delete(message.applicationId);
                                updateDeployButton(message.applicationId, false);
                            }
                            break;
                    }
                });

                function updateUI(applications, deployments) {
                    if (!applications || !deployments) return;

                    // Update Applications
                    const appsContainer = document.getElementById('applications');
                    if (applications.length === 0) {
                        appsContainer.innerHTML = '<div class="empty">No applications found</div>';
                    } else {
                        appsContainer.innerHTML = applications.map(app => \`
                            <div class="card">
                                <div class="card-main">
                                    <div class="card-title">\${app.name}</div>
                                    <div class="card-subtitle">\${app.fqdn || 'No URL configured'}</div>
                                    <div class="card-content">
                                        <span class="label">Repository:</span>
                                        <span class="value">\${app.git_repository || 'N/A'}</span>
                                        <span class="label">Branch:</span>
                                        <span class="value">\${app.git_branch || 'N/A'}</span>
                                        <span class="label">Last Updated:</span>
                                        <span class="value">\${formatDate(app.updated_at)}</span>
                                    </div>
                                </div>
                                <div class="card-footer">
                                    <span class="status">\${app.status}</span>
                                    <button class="deploy-button" onclick="deployApplication('\${app.id}')">
                                        Deploy
                                    </button>
                                </div>
                            </div>
                        \`).join('');
                    }

                    // Update Deployments
                    const deploymentsContainer = document.getElementById('deployments');
                    if (deployments.length === 0) {
                        deploymentsContainer.innerHTML = '<div class="empty">No active deployments</div>';
                    } else {
                        deploymentsContainer.innerHTML = deployments.map(deployment => \`
                            <div class="card deployment-card">
                                <div class="card-main">
                                    <div class="card-title">\${deployment.applicationName}</div>
                                    <div class="deployment-time">Started \${deployment.startedAt}</div>
                                    <div class="commit-message">\${deployment.commit}</div>
                                </div>
                                <div class="card-footer">
                                    <span class="status deployment-status">\${deployment.status}</span>
                                </div>
                            </div>
                        \`).join('');
                    }
                }
            </script>
        </body>
        </html>`;
  }

  private _getWelcomeHtml() {
    const logoUri = this._view?.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'public', 'logo.svg')
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                margin: 0;
                height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .content {
                text-align: center;
                max-width: 100%;
            }
            .logo {
                width: 80px;
                height: 80px;
                margin-bottom: 16px;
                transition: filter 0.2s ease;
            }
            .logo:hover {
                filter: drop-shadow(0 4px 8px rgba(140, 82, 255, 0.3));
            }
            h2 {
                font-size: 1.2em;
                margin: 0 0 8px;
                font-weight: 600;
            }
            .subtitle {
                color: var(--vscode-descriptionForeground);
                margin: 0 0 20px;
                font-size: 0.9em;
                line-height: 1.4;
            }
            .configure-button {
                padding: 8px 16px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                margin-bottom: 16px;
            }
            .configure-button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            .docs-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                font-size: 0.9em;
            }
            .docs-link:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="content">
            <img src="${logoUri}" alt="Coolify Logo" class="logo" />
            <h2>Coolify for VSCode</h2>
            <p class="subtitle">
                Configure your Coolify server to get started
            </p>
            <button class="configure-button" onclick="configure()">
                Configure
            </button>
            <br>
            <a href="https://coolify.io/docs/api-reference/authorization#generate" 
               class="docs-link" 
               target="_blank">
                Learn how to generate API token →
            </a>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            
            function configure() {
                vscode.postMessage({ type: 'configure' });
            }
        </script>
    </body>
    </html>`;
  }

  public dispose() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.messageHandler) {
      this.messageHandler.dispose();
    }
  }
}
