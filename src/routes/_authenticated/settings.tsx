import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Key,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  HelpCircle,
  ImageIcon,
  ShieldCheck,
  Lock,
  Sparkles,
} from "lucide-react";
import { auth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAiSettings,
  saveAiSettings,
  loadAiSettings,
  verifyOpenRouterKey,
  POPULAR_MODELS,
  POPULAR_POLLINATIONS_MODELS,
  POPULAR_CLOUDFLARE_MODELS,
  type AiSettings,
} from "@/lib/settings";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Inkwell" },
      { name: "description", content: "Configure your OpenRouter, Pollinations, and Cloudflare credentials." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid ?? "";

  const [settings, setSettings] = useState<AiSettings>(getAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [modelCategory, setModelCategory] = useState<"all" | "free" | "flagship">("all");

  const [testResult, setTestResult] = useState<{
    tested: boolean;
    valid?: boolean | undefined;
    label?: string | undefined;
    usage?: number | undefined;
    limit?: number | null | undefined;
    error?: string | undefined;
  } | null>(null);

  // Image generation state
  const [showImageKeys, setShowImageKeys] = useState(true);
  const [showPollinationsKey, setShowPollinationsKey] = useState(false);
  const [showCloudflareToken, setShowCloudflareToken] = useState(false);

  useEffect(() => {
    if (!uid) return;
    loadAiSettings(uid).then((loaded) => {
      setSettings(loaded);
      const isKnown = POPULAR_MODELS.some((m) => m.id === loaded.openRouterModel);
      if (!isKnown && loaded.openRouterModel) {
        setIsCustom(true);
        setCustomModel(loaded.openRouterModel);
      }
    });
  }, [uid]);

  async function handleTestOpenRouterKey() {
    const key = (settings.openRouterApiKey || "").trim();
    if (!key) {
      toast.error("Please enter an OpenRouter API key first.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await verifyOpenRouterKey(key);
      setTestResult({
        tested: true,
        valid: res.valid,
        label: res.label,
        usage: res.usage,
        limit: res.limit,
        error: res.error,
      });
      if (res.valid) {
        toast.success("OpenRouter API key is valid and connected!");
      } else {
        toast.error(res.error || "Invalid API key");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedOpenRouterModel = isCustom ? customModel.trim() : (settings.openRouterModel || "").trim();

      if (!selectedOpenRouterModel) {
        toast.error("Please select or enter an OpenRouter AI model.");
        setSaving(false);
        return;
      }

      await saveAiSettings(
        {
          textProvider: "openrouter",
          openRouterApiKey: (settings.openRouterApiKey || "").trim(),
          openRouterModel: selectedOpenRouterModel,
          imagePollinationsApiKey: (settings.imagePollinationsApiKey || "").trim(),
          imagePollinationsModel: (settings.imagePollinationsModel || "").trim(),
          imageCloudflareAccountId: (settings.imageCloudflareAccountId || "").trim(),
          imageCloudflareApiToken: (settings.imageCloudflareApiToken || "").trim(),
          imageCloudflareModel: (settings.imageCloudflareModel || "").trim(),
          imageProvider: settings.imageProvider,
        },
        uid,
      );
      toast.success("Settings saved successfully!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-8">
      {/* Header */}
      <header className="flex items-center justify-between border-b rule-ink pb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/stories"
            className="flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to stories
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-display font-bold">Settings</span>
        </div>
        <Link to="/" className="font-display text-2xl font-extrabold">
          Inkwell
        </Link>
      </header>

      <div className="mt-10">
        <h1 className="text-4xl font-extrabold">AI Provider & Settings</h1>
        <p className="mt-2 font-serif text-lg text-muted-foreground">
          Configure your OpenRouter credentials for intelligent writing assistance,
          and Pollinations or Cloudflare for storyboard illustration.
        </p>

        {/* Strict Security & Privacy Guarantee */}
        <div className="mt-6 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span>Strict Privacy & Zero Data Retention Enforced</span>
          </div>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1.5 leading-relaxed">
            <li>
              <strong className="text-foreground">Zero AI Training & Retention:</strong> All OpenRouter text requests enforce <code className="bg-background px-1 py-0.5 rounded border text-[11px]">provider: &#123; data_collection: "deny" &#125;</code>, ensuring AI model providers are legally and technically prohibited from retaining or training on your creative writing.
            </li>
            <li>
              <strong className="text-foreground">Storyboard Privacy:</strong> Pollinations AI frame generation uses <code className="bg-background px-1 py-0.5 rounded border text-[11px]">nofeed=true</code> and <code className="bg-background px-1 py-0.5 rounded border text-[11px]">private=true</code> so generated images and scene prompts never appear on public feeds.
            </li>
            <li>
              <strong className="text-foreground">Isolated Key Storage:</strong> Your API keys and story manuscripts are strictly isolated by Firestore row-level security rules matching your user ID and are never exposed to third parties.
            </li>
          </ul>
        </div>

        <form onSubmit={handleSave} className="mt-8 space-y-8">
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 1: OPENROUTER TEXT GENERATION                           */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="page rounded-lg p-6 space-y-5 border border-primary/40 ring-1 ring-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sepia/15 text-sepia">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">OpenRouter (Writing)</h2>
                    <span className="bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                      ACTIVE FOR WRITING
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Connect to Claude 3.5 Sonnet, GPT-4o, and DeepSeek via OpenRouter
                  </p>
                </div>
              </div>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center text-xs text-sepia hover:underline"
              >
                Get a key at OpenRouter
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </div>

            <div className="space-y-2">
              <Label htmlFor="openRouterKey">OpenRouter API Key</Label>
              <div className="relative flex items-center">
                <Input
                  id="openRouterKey"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-or-v1-..."
                  className="pr-24 font-mono text-sm"
                  value={settings.openRouterApiKey}
                  onChange={(e) => {
                    setSettings({ ...settings, openRouterApiKey: e.target.value });
                    setTestResult(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Test Connection Button & Result */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing || !settings.openRouterApiKey?.trim()}
                onClick={handleTestOpenRouterKey}
              >
                {testing ? "Testing connection…" : "Test OpenRouter Key"}
              </Button>

              {testResult && testResult.valid && (
                <div className="flex items-center text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                  <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                  <span>
                    Connected successfully! {testResult.label ? `(${testResult.label})` : ""}
                    {testResult.usage !== undefined
                      ? ` • Usage: $${Number(testResult.usage).toFixed(3)}`
                      : ""}
                  </span>
                </div>
              )}

              {testResult && !testResult.valid && (
                <div className="flex items-center text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20">
                  <XCircle className="mr-1.5 h-4 w-4" />
                  <span>{testResult.error || "Invalid API key"}</span>
                </div>
              )}
            </div>

            {/* Models Grid & Categorization */}
            <div className="space-y-4 pt-3 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-semibold">OpenRouter Writing Model</Label>
                  <p className="text-xs text-muted-foreground">
                    Select from top verified 100% free models ($0/token) or premium creative flagships.
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/60 border text-xs self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setModelCategory("all")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      modelCategory === "all"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All ({POPULAR_MODELS.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelCategory("free")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                      modelCategory === "free"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-emerald-700 dark:text-emerald-400 hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    Free Models ({POPULAR_MODELS.filter((m) => m.isFree).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelCategory("flagship")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      modelCategory === "flagship"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Flagship ({POPULAR_MODELS.filter((m) => !m.isFree).length})
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {POPULAR_MODELS.filter((m) =>
                  modelCategory === "all" ? true : m.category === modelCategory,
                ).map((m) => {
                  const isSelected = !isCustom && settings.openRouterModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setIsCustom(false);
                        setSettings({ ...settings, openRouterModel: m.id });
                      }}
                      className={`relative text-left p-3.5 rounded-md border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary shadow-sm"
                          : "border-border hover:border-sepia/50 bg-background/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm">{m.name}</span>
                            {m.isFree && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                <Sparkles className="h-2.5 w-2.5" />
                                FREE
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {m.description}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-sepia/10 text-sepia font-semibold">
                            {m.tag}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {m.contextLength} ctx
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-muted-foreground/80 break-all">
                        {m.id}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Custom Model Toggle */}
              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="customModelToggle"
                    checked={isCustom}
                    onChange={(e) => {
                      setIsCustom(e.target.checked);
                      if (e.target.checked && !customModel) {
                        setCustomModel(settings.openRouterModel);
                      }
                    }}
                    className="rounded border-border"
                  />
                  <Label htmlFor="customModelToggle" className="cursor-pointer text-xs">
                    Use custom OpenRouter model ID
                  </Label>
                </div>

                {isCustom && (
                  <div className="mt-2 space-y-1">
                    <Input
                      placeholder="e.g. google/gemma-4-31b-it:free or deepseek/deepseek-chat"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter any model ID from the OpenRouter catalog.{" "}
                      <a
                        href="https://openrouter.ai/models?max_price=0"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sepia underline inline-flex items-center"
                      >
                        Browse all free models on OpenRouter
                        <ExternalLink className="ml-0.5 h-3 w-3" />
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 2: IMAGE GENERATION PROVIDERS (POLLINATIONS / CF)       */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="page rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sepia/15 text-sepia">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Image Generation Providers</h2>
                  <p className="text-xs text-muted-foreground">
                    Configure API keys for storyboard illustration. Pollinations AI and Cloudflare Workers AI supported.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-sm text-sepia hover:underline"
                onClick={() => setShowImageKeys(!showImageKeys)}
              >
                {showImageKeys ? "Hide" : "Show"} image keys
              </button>
            </div>

            {showImageKeys && (
              <div className="space-y-4">
                {/* Provider selector */}
                <div className="space-y-2">
                  <Label htmlFor="imageProvider">Default Image Provider</Label>
                  <Select
                    value={settings.imageProvider}
                    onValueChange={(v) => setSettings({ ...settings, imageProvider: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pollinations">Pollinations AI URL Generator (Fast, Free or Keyed)</SelectItem>
                      <SelectItem value="cloudflare">Cloudflare Workers AI (Account ID + Token)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Pollinations AI URL Generator */}
                <div className="border rounded-md p-4 space-y-3 bg-background/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">Pollinations AI URL Generator</span>
                      <p className="text-xs text-muted-foreground">
                        Instant URL-based image generation. Free tier available with no mandatory API key, or enter your secret/publishable key for priority.
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      settings.imageProvider === "pollinations" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {settings.imageProvider === "pollinations" ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="imagePollinationsKey">API Key (Optional)</Label>
                    <div className="relative flex items-center">
                      <Input
                        id="imagePollinationsKey"
                        type={showPollinationsKey ? "text" : "password"}
                        placeholder="sk_... (optional for free tier)"
                        className="pr-24 font-mono text-sm"
                        value={settings.imagePollinationsApiKey}
                        onChange={(e) => setSettings({ ...settings, imagePollinationsApiKey: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPollinationsKey(!showPollinationsKey)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground"
                        aria-label={showPollinationsKey ? "Hide key" : "Show key"}
                      >
                        {showPollinationsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Works without a key, or get a priority key at <a href="https://enter.pollinations.ai" target="_blank" rel="noreferrer" className="underline">enter.pollinations.ai</a>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="imagePollinationsModel">Model / Style</Label>
                    <div className="space-y-2">
                      <Select
                        value={
                          POPULAR_POLLINATIONS_MODELS.some((m) => m.id === settings.imagePollinationsModel)
                            ? settings.imagePollinationsModel
                            : "custom"
                        }
                        onValueChange={(val) => {
                          if (val !== "custom") {
                            setSettings({ ...settings, imagePollinationsModel: val });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Pollinations model" />
                        </SelectTrigger>
                        <SelectContent>
                          {POPULAR_POLLINATIONS_MODELS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom model name…</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        id="imagePollinationsModel"
                        placeholder="e.g. flux, flux-realism, turbo"
                        className="font-mono text-sm"
                        value={settings.imagePollinationsModel}
                        onChange={(e) => setSettings({ ...settings, imagePollinationsModel: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Cloudflare Workers AI */}
                <div className="border rounded-md p-4 space-y-3 bg-background/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">Cloudflare Workers AI Image Generator</span>
                      <p className="text-xs text-muted-foreground">
                        Run FLUX.1 Schnell or SDXL on Cloudflare's serverless GPU edge network.
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      settings.imageProvider === "cloudflare" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {settings.imageProvider === "cloudflare" ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="imageCloudflareAccountId">Cloudflare Account ID</Label>
                    <Input
                      id="imageCloudflareAccountId"
                      placeholder="e.g. 1a2b3c4d5e6f..."
                      className="font-mono text-sm"
                      value={settings.imageCloudflareAccountId}
                      onChange={(e) => setSettings({ ...settings, imageCloudflareAccountId: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Find in Cloudflare Dashboard under Workers & Pages or Overview.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="imageCloudflareToken">Cloudflare API Token</Label>
                    <div className="relative flex items-center">
                      <Input
                        id="imageCloudflareToken"
                        type={showCloudflareToken ? "text" : "password"}
                        placeholder="API Token with Workers AI Read/Write permission"
                        className="pr-24 font-mono text-sm"
                        value={settings.imageCloudflareApiToken}
                        onChange={(e) => setSettings({ ...settings, imageCloudflareApiToken: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCloudflareToken(!showCloudflareToken)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground"
                        aria-label={showCloudflareToken ? "Hide token" : "Show token"}
                      >
                        {showCloudflareToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create token at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="underline">dash.cloudflare.com/profile/api-tokens</a> with Workers AI permission.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="imageCloudflareModel">Model Name</Label>
                    <div className="space-y-2">
                      <Select
                        value={
                          POPULAR_CLOUDFLARE_MODELS.some((m) => m.id === settings.imageCloudflareModel)
                            ? settings.imageCloudflareModel
                            : "custom"
                        }
                        onValueChange={(val) => {
                          if (val !== "custom") {
                            setSettings({ ...settings, imageCloudflareModel: val });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Cloudflare model" />
                        </SelectTrigger>
                        <SelectContent>
                          {POPULAR_CLOUDFLARE_MODELS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom model name…</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        id="imageCloudflareModel"
                        placeholder="e.g. @cf/black-forest-labs/flux-1-schnell"
                        className="font-mono text-sm"
                        value={settings.imageCloudflareModel}
                        onChange={(e) => setSettings({ ...settings, imageCloudflareModel: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* How it works info card */}
          <div className="rounded-lg border border-sepia/20 bg-sepia/5 p-5 text-sm text-foreground/80">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-sepia shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Why OpenRouter?</p>
                <p className="font-serif text-xs leading-relaxed text-muted-foreground">
                  OpenRouter gives you a single API key to access hundreds of leading AI models
                  (including Claude 3.5 Sonnet, GPT-4o, and DeepSeek) on pay-as-you-go terms.
                  Your key is saved securely in your profile and used directly for your story
                  drafts and suggestions.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/stories" })}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
