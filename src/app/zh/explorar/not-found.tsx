import { EXPLORE_PATH } from "@/modules/explore/paths";

export default function ExploreNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">未找到该示例页面</h1>
      <p className="mt-3 text-ink-soft">请返回品牌目录重新选择。</p>
      <a href={EXPLORE_PATH} className="mt-6 inline-flex min-h-11 items-center font-medium text-brand hover:underline">
        返回品牌目录
      </a>
    </div>
  );
}
