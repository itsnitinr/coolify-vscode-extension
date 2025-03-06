import * as vscode from 'vscode';

export class ConfigurationManager {
  private static readonly SERVER_URL_KEY = 'serverUrl';
  private static readonly TOKEN_KEY = 'coolifyToken';

  constructor(private context: vscode.ExtensionContext) {}

  async isConfigured(): Promise<boolean> {
    const serverUrl = this.context.globalState.get<string>(
      ConfigurationManager.SERVER_URL_KEY
    );
    const token = await this.context.secrets.get(
      ConfigurationManager.TOKEN_KEY
    );
    return !!serverUrl && !!token;
  }

  async getServerUrl(): Promise<string | undefined> {
    return this.context.globalState.get<string>(
      ConfigurationManager.SERVER_URL_KEY
    );
  }

  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get(ConfigurationManager.TOKEN_KEY);
  }

  async setServerUrl(url: string): Promise<void> {
    await this.context.globalState.update(
      ConfigurationManager.SERVER_URL_KEY,
      url
    );
  }

  async setToken(token: string): Promise<void> {
    await this.context.secrets.store(ConfigurationManager.TOKEN_KEY, token);
  }

  async clearConfiguration(): Promise<void> {
    await this.context.globalState.update(
      ConfigurationManager.SERVER_URL_KEY,
      undefined
    );
    await this.context.secrets.delete(ConfigurationManager.TOKEN_KEY);
  }
}
