import React, { useState } from 'react';
import { Sparkles, Copy, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/hooks/useWorkspace';
import { aiService } from '@/services/ecommerce';
import type { AIGenerateResponse } from '@/types/ecommerce';

interface AIProductGeneratorProps {
  onApply: (result: { title: string; description: string; highlights: string[]; tags: string[] }) => void;
}

const platforms = [
  { value: 'general', label: '通用' },
  { value: 'taobao', label: '淘宝' },
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
] as const;

const styles = [
  { value: 'professional', label: '专业' },
  { value: 'lively', label: '活泼' },
  { value: 'premium', label: '高端' },
] as const;

export const AIProductGenerator: React.FC<AIProductGeneratorProps> = ({ onApply }) => {
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();

  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [platform, setPlatform] = useState<string>('general');
  const [style, setStyle] = useState<string>('professional');
  const [result, setResult] = useState<AIGenerateResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!productName.trim() || !category.trim() || !sellingPoints.trim()) {
      addToast('warning', '请填写完整信息', '商品名称、类目和卖点不能为空');
      return;
    }
    if (!currentWorkspace) return;

    setIsGenerating(true);
    setResult(null);
    try {
      const data = await aiService.generateProductDescription(currentWorkspace.slug, {
        product_name: productName,
        category,
        selling_points: sellingPoints,
        platform: platform as 'general' | 'taobao' | 'douyin' | 'xiaohongshu',
        style: style as 'professional' | 'lively' | 'premium',
      });
      setResult(data);
      addToast('success', '生成成功', 'AI 已为你生成商品描述');
    } catch (err: any) {
      addToast('error', '生成失败', err?.response?.data?.detail || '请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast('success', '已复制', '描述已复制到剪贴板');
    }
  };

  const handleApply = () => {
    if (result) {
      onApply({
        title: result.title,
        description: result.description,
        highlights: result.highlights,
        tags: result.tags,
      });
      addToast('success', '已应用', 'AI 生成的描述已应用到商品表单');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-purple-600" />
          <span className="text-sm font-semibold text-purple-700">AI 商品描述生成器</span>
        </div>
        <p className="text-xs text-purple-600/70 mb-4">
          输入商品信息，AI 将为你生成专业的商品描述和营销文案
        </p>

        <div className="space-y-3">
          <Input
            label="商品名称"
            placeholder="例如：夏季新款纯棉T恤"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
          <Input
            label="商品类目"
            placeholder="例如：服装 > 男装 > T恤"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">商品卖点</label>
            <textarea
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors duration-200 resize-none"
              rows={3}
              placeholder="例如：纯棉面料、透气舒适、多色可选、限时优惠"
              value={sellingPoints}
              onChange={(e) => setSellingPoints(e.target.value)}
            />
          </div>

          {/* 目标平台 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">目标平台</label>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    platform === p.value
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-300 hover:border-purple-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 文案风格 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">文案风格</label>
            <div className="flex flex-wrap gap-2">
              {styles.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    style === s.value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-300 hover:border-indigo-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            isLoading={isGenerating}
            leftIcon={<Sparkles size={16} />}
            className="w-full"
          >
            {isGenerating ? '生成中...' : '生成 AI 描述'}
          </Button>
        </div>
      </div>

      {/* 生成结果 */}
      {result && (
        <div className="border border-green-200 rounded-xl bg-green-50/50 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-green-700" />
              <span className="text-sm font-semibold text-green-700">生成结果</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopy} leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}>
                {copied ? '已复制' : '复制'}
              </Button>
              <Button variant="primary" size="sm" onClick={handleApply}>
                一键应用
              </Button>
            </div>
          </div>

          <div className="mb-3">
            <h4 className="text-sm font-medium text-slate-900 mb-1">{result.title}</h4>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{result.description}</p>
          </div>

          {result.highlights.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1.5">核心卖点</p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                {result.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {result.tags.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">推荐标签</p>
              <div className="flex flex-wrap gap-1.5">
                {result.tags.map((tag, i) => (
                  <Badge key={i} variant="primary">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};