import { QueryClient } from '@tanstack/react-query';

/**
 * 全局 QueryClient。
 *
 * 背景：项目此前没有数据获取层 —— 31 个页面各自手写
 * `useEffect` + `setIsLoading` / `try` / `catch` / `finally`，而 `services/api.ts`
 * 里还叠了一层「10 秒 GET 缓存」来救同一接口被重复请求的问题。那是在传输层
 * 打补丁：缓存 key 用完整 URL、任何写操作都对整张表 `clear()`，粒度粗且难以推理。
 *
 * 下面的默认值按「管理台 = 读多写少」的特征设定：
 *   staleTime 10s     —— 与原先那层 hack 的窗口保持一致，行为不突变
 *   refetchOnWindowFocus: false —— 管理台切窗口回来就重拉会造成明显闪烁
 *   retry 1           —— 单次重试足够覆盖抖动，避免故障时雪崩
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default queryClient;
