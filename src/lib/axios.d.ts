declare module "axios" {
  interface AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: any;
  }

  interface AxiosInstance {
    post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>>;
    create(config: any): AxiosInstance;
    interceptors: {
      response: {
        use(onFulfilled: (value: AxiosResponse) => any, onRejected: (error: any) => any): number;
      };
    };
  }

  // Inne potrzebne typy
  export function create(config?: any): AxiosInstance;
  const axios: AxiosInstance & {
    create: typeof create;
  };

  export default axios;
  export { AxiosInstance, AxiosResponse };
}
