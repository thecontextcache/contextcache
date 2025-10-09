/**
 * API client for ContextCache backend
 */
import axios, { AxiosInstance } from 'axios';
import type { Project } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 300000, // 5 minutes for large uploads
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // -------------------------
  // 🔹 Projects
  // -------------------------
  async createProject(name: string, passphrase: string): Promise<Project> {
    const response = await this.client.post<Project>('/projects', {
      name,
      passphrase,
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
    const formData = new FormData();
    formData.append('name', name);
    const response = await this.client.put(`/projects/${projectId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
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