import * as vscode from 'vscode';

interface Application {
  uuid: string;
  name: string;
  status: string;
  git_branch: string;
  git_commit_sha: string;
  destination_type: string;
  fqdn: string;
  git_repository: string;
  updated_at: string;
  description: string;
}

interface Deployment {
  id: string;
  application_id: string;
  application_name: string;
  status: string;
  commit: string;
  created_at: string;
  deployment_url: string;
  commit_message: string;
}

export class CoolifyService {
  constructor(private baseUrl: string, private token: string) {}

  private async fetchWithAuth<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data as T;
  }

  async getApplications(): Promise<Application[]> {
    return this.fetchWithAuth<Application[]>('/api/v1/applications');
  }

  async getDeployments(): Promise<Deployment[]> {
    return this.fetchWithAuth<Deployment[]>('/api/v1/deployments');
  }

  async startDeployment(uuid: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/deploy?uuid=${uuid}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to start deployment: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Error starting deployment:', error);
      throw error;
    }
  }

  /**
   * Verifies if the token is valid by making a test API call
   * @returns true if token is valid, false otherwise
   */
  async verifyToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/verify`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Error verifying token:', error);
      return false;
    }
  }

  /**
   * Tests the connection to the Coolify server
   * @returns true if server is reachable, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/status`);
      return response.ok;
    } catch (error) {
      console.error('Error testing connection:', error);
      return false;
    }
  }
}
