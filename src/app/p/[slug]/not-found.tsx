export default function PublicNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">该产品已不可用</h1>
      <p className="mt-3 text-ink-soft">生产者已永久删除此产品，或链接、二维码不完整。请向生产者索取新的链接。</p>
    </div>
  );
}
