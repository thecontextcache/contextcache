/**
 * API client for ContextCache backend
 * Enhanced with Clerk authentication
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { Project } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class APIClient {
  client: AxiosInstance;
  private getToken: (() => Promise<string | null>) | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 300000, // 5 minutes for large uploads
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to inject Clerk JWT token
    this.client.interceptors.request.use(
      async (config) => {
        if (this.getToken) {
          const token = await this.getToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor to handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Session expired or locked
          console.error('Authentication failed:', error.response.data);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set the token getter function (called from React component with useAuth)
   */
  setTokenGetter(getter: () => Promise<string | null>) {
    this.getToken = getter;
  }

  // -------------------------
  // 🔹 Authentication
  // -------------------------
  async unlockSession(masterPassphrase: string): Promise<{
    status: string;
    user_id: string;
    session_id: string;
    expires_in: number;
  }> {
    const formData = new FormData();
    formData.append('master_passphrase', masterPassphrase);
    
    const response = await this.client.post('/auth/unlock', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async checkSessionStatus(): Promise<{
    unlocked: boolean;
    session_id?: string;
    message?: string;
  }> {
    const response = await this.client.get('/auth/status');
    return response.data;
  }

  async logout(): Promise<{ status: string }> {
    const response = await this.client.post('/auth/logout');
    return response.data;
  }

  // -------------------------
  // 🔹 Projects
  // -------------------------
  async createProject(name: string, passphrase: string): Promise<Project> {
    // ✅ FIX: Send JSON body with both name and passphrase
    const response = await this.client.post<Project>('/projects', {
      name: name,
      passphrase: passphrase,
    });
    return response.data;
  }

  async listProjects(): Promise<Project[]> {
    const response = await this.client.get<Project[]>('/projects');
    return response.data;
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.client.get<Project>(`/projects/${projectId}`);
    return response.data;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.client.delete(`/projects/${projectId}`);
  }

  async updateProject(projectId: string, name: string): Promise<any> {
    const response = await this.client.put(`/projects/${projectId}`, { name });
    return response.data;
  }

  async getProjectStats(projectId: string): Promise<any> {
    const response = await this.client.get(`/projects/${projectId}/stats`);
    return response.data;
  }

  async getProjectGraph(projectId: string): Promise<any> {
    const response = await this.client.get(`/projects/${projectId}/graph`);
    return response.data;
  }

  async getProjectAudit(projectId: string, limit: number = 100): Promise<any> {
    const response = await this.client.get(`/projects/${projectId}/audit`, {
      params: { limit },
    });
    return response.data;
  }

  // -------------------------
  // 🔹 Documents
  // -------------------------
  async ingestDocument(
    projectId: string,
    file?: File,
    url?: string
  ): Promise<any> {
    const formData = new FormData();
    formData.append('project_id', projectId);

    if (file) {
      formData.append('source_type', 'file');
      formData.append('file', file);
    } else if (url) {
      formData.append('source_type', 'url');
      formData.append('source_url', url);
    } else {
      throw new Error('Either file or url must be provided');
    }

    const response = await this.client.post('/documents/ingest', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async listDocuments(projectId: string): Promise<any[]> {
    const response = await this.client.get('/documents', {
      params: { project_id: projectId },
    });
    return response.data;
  }

  async query(projectId: string, query: string, limit: number = 5): Promise<any> {
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('query', query);
    formData.append('limit', limit.toString());

    const response = await this.client.post('/query', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  // -------------------------
  // 🔹 Health Check
  // -------------------------
  async health(): Promise<{ status: string; version: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export default new APIClient();