declare module "axios" {
  interface AxiosResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: AxiosRequestConfig;
  }

  interface AxiosRequestConfig {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    data?: unknown;
    timeout?: number;
    [key: string]: unknown;
  }

  interface AxiosInstance {
    post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    create(config: AxiosRequestConfig): AxiosInstance;
    interceptors: {
      response: {
        use(onFulfilled: (value: AxiosResponse) => unknown, onRejected: (error: unknown) => unknown): number;
      };
    };
  }

  // Inne potrzebne typy
  export function create(config?: AxiosRequestConfig): AxiosInstance;
  const axios: AxiosInstance & {
    create: typeof create;
  };

  export default axios;
  export { AxiosInstance, AxiosResponse, AxiosRequestConfig };
}
