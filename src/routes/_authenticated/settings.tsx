import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Key,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  HelpCircle,
  ImageIcon,
  Copy,
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
  verifyGeminiKey,
  POPULAR_MODELS,
  POPULAR_GEMINI_TEXT_MODELS,
  POPULAR_GEMINI_IMAGE_MODELS,
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
      { name: "description", content: "Configure your AI text and image generation providers and API keys." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid ?? "";

  const [settings, setSettings] = useState<AiSettings>(getAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [showGeminiTextKey, setShowGeminiTextKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingGeminiText, setTestingGeminiText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [customGeminiModel, setCustomGeminiModel] = useState("");
  const [isCustomGemini, setIsCustomGemini] = useState(false);

  const [testResult, setTestResult] = useState<{
    tested: boolean;
    valid?: boolean | undefined;
    label?: string | undefined;
    usage?: number | undefined;
    limit?: number | null | undefined;
    error?: string | undefined;
  } | null>(null);

  const [geminiTextTestResult, setGeminiTextTestResult] = useState<{
    tested: boolean;
    valid?: boolean | undefined;
    error?: string | undefined;
  } | null>(null);

  // Image generation state
  const [showImageKeys, setShowImageKeys] = useState(true);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showPollinationsKey, setShowPollinationsKey] = useState(false);
  const [showCloudflareToken, setShowCloudflareToken] = useState(false);
  const [testingGeminiImage, setTestingGeminiImage] = useState(false);
  const [geminiImageTestResult, setGeminiImageTestResult] = useState<{
    tested: boolean;
    valid?: boolean | undefined;
    error?: string | undefined;
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    loadAiSettings(uid).then((loaded) => {
      setSettings(loaded);
      const isKnown = POPULAR_MODELS.some((m) => m.id === loaded.openRouterModel);
      if (!isKnown && loaded.openRouterModel) {
        setIsCustom(true);
        setCustomModel(loaded.openRouterModel);
      }
      const isKnownGemini = POPULAR_GEMINI_TEXT_MODELS.some((m) => m.id === loaded.geminiModel);
      if (!isKnownGemini && loaded.geminiModel) {
        setIsCustomGemini(true);
        setCustomGeminiModel(loaded.geminiModel);
      }
    });
  }, [uid]);

  async function handleTestOpenRouterKey() {
    if (!settings.openRouterApiKey.trim()) {
      toast.error("Please enter an OpenRouter API key first.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await verifyOpenRouterKey(settings.openRouterApiKey);
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

  async function handleTestGeminiTextKey() {
    if (!settings.geminiApiKey.trim()) {
      toast.error("Please enter a Gemini API key first.");
      return;
    }
    setTestingGeminiText(true);
    setGeminiTextTestResult(null);
    try {
      const res = await verifyGeminiKey(settings.geminiApiKey);
      setGeminiTextTestResult({
        tested: true,
        valid: res.valid,
        error: res.error,
      });
      if (res.valid) {
        toast.success("Google Gemini API key is valid and connected!");
      } else {
        toast.error(res.error || "Invalid Gemini API key");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingGeminiText(false);
    }
  }

  async function handleTestGeminiImageKey() {
    if (!settings.imageGeminiApiKey.trim()) {
      toast.error("Please enter a Gemini API key for image generation first.");
      return;
    }
    setTestingGeminiImage(true);
    setGeminiImageTestResult(null);
    try {
      const res = await verifyGeminiKey(settings.imageGeminiApiKey);
      setGeminiImageTestResult({
        tested: true,
        valid: res.valid,
        error: res.error,
      });
      if (res.valid) {
        toast.success("Gemini image API key is valid and connected!");
      } else {
        toast.error(res.error || "Invalid Gemini API key");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingGeminiImage(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedOpenRouterModel = isCustom ? customModel.trim() : settings.openRouterModel;
      const selectedGeminiModel = isCustomGemini ? customGeminiModel.trim() : settings.geminiModel;

      if (settings.textProvider === "openrouter" && !selectedOpenRouterModel) {
        toast.error("Please select or enter an OpenRouter AI model.");
        setSaving(false);
        return;
      }
      if (settings.textProvider === "gemini" && !selectedGeminiModel) {
        toast.error("Please select or enter a Gemini AI model.");
        setSaving(false);
        return;
      }

      await saveAiSettings(
        {
          textProvider: settings.textProvider,
          openRouterApiKey: settings.openRouterApiKey.trim(),
          openRouterModel: selectedOpenRouterModel,
          geminiApiKey: settings.geminiApiKey.trim(),
          geminiModel: selectedGeminiModel,
          imageGeminiApiKey: settings.imageGeminiApiKey.trim(),
          imageGeminiModel: settings.imageGeminiModel.trim(),
          imagePollinationsApiKey: settings.imagePollinationsApiKey.trim(),
          imagePollinationsModel: settings.imagePollinationsModel.trim(),
          imageCloudflareAccountId: settings.imageCloudflareAccountId.trim(),
          imageCloudflareApiToken: settings.imageCloudflareApiToken.trim(),
          imageCloudflareModel: settings.imageCloudflareModel.trim(),
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
          Configure your Google Gemini or OpenRouter credentials for intelligent writing assistance,
          story drafting, and storyboard illustration.
        </p>

        <form onSubmit={handleSave} className="mt-8 space-y-8">
          {/* Active Text Generation Provider Toggle */}
          <div className="page rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Writing Assistant Provider</h2>
                <p className="text-xs text-muted-foreground">
                  Select which provider powers story drafting, rewriting, and scene breakdowns
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 pt-1">
              {/* Gemini Button */}
              <button
                type="button"
                onClick={() => setSettings({ ...settings, textProvider: "gemini" })}
                className={`text-left p-4 rounded-md border transition-all ${
                  settings.textProvider === "gemini"
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:border-sepia/50 bg-background/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">Google Gemini</span>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded-full ${
                      settings.textProvider === "gemini"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {settings.textProvider === "gemini" ? "Active Provider" : "Click to select"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Direct Google API with Gemini 2.5 Flash & Pro. Extremely fast, generous free tier, 1M+ token context.
                </p>
              </button>

              {/* OpenRouter Button */}
              <button
                type="button"
                onClick={() => setSettings({ ...settings, textProvider: "openrouter" })}
                className={`text-left p-4 rounded-md border transition-all ${
                  settings.textProvider === "openrouter"
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:border-sepia/50 bg-background/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">OpenRouter</span>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded-full ${
                      settings.textProvider === "openrouter"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {settings.textProvider === "openrouter" ? "Active Provider" : "Click to select"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Access 100+ models including Claude 3.5 Sonnet, GPT-4o, and DeepSeek R1 with a single key.
                </p>
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 1: GOOGLE GEMINI TEXT GENERATION                        */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div
            className={`page rounded-lg p-6 space-y-5 border transition-all ${
              settings.textProvider === "gemini" ? "border-primary/40 ring-1 ring-primary/20" : "opacity-90"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sepia/15 text-sepia">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">Google Gemini (Writing)</h2>
                    {settings.textProvider === "gemini" && (
                      <span className="bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                        ACTIVE FOR WRITING
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Powers script generation, character bibles, scene suggestions, and outline drafting
                  </p>
                </div>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="flex items-center text-xs text-sepia hover:underline"
              >
                Get a free key at Google AI Studio
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </div>

            {/* Gemini API Key */}
            <div className="space-y-2">
              <Label htmlFor="geminiApiKey">Gemini API Key</Label>
              <div className="relative flex items-center">
                <Input
                  id="geminiApiKey"
                  type={showGeminiTextKey ? "text" : "password"}
                  placeholder="AIzaSy..."
                  className="pr-24 font-mono text-sm"
                  value={settings.geminiApiKey}
                  onChange={(e) => {
                    setSettings({ ...settings, geminiApiKey: e.target.value });
                    setGeminiTextTestResult(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiTextKey(!showGeminiTextKey)}
                  className="absolute right-3 text-muted-foreground hover:text-foreground"
                  aria-label={showGeminiTextKey ? "Hide key" : "Show key"}
                >
                  {showGeminiTextKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Test Gemini Key & Copy Options */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testingGeminiText || !settings.geminiApiKey.trim()}
                onClick={handleTestGeminiTextKey}
              >
                {testingGeminiText ? "Testing Gemini…" : "Test Gemini Key"}
              </Button>

              {settings.geminiApiKey.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSettings({ ...settings, imageGeminiApiKey: settings.geminiApiKey.trim() });
                    toast.success("Copied Gemini API key to Image Generation!");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Use same key for Image Generation
                </Button>
              )}

              {geminiTextTestResult && geminiTextTestResult.valid && (
                <div className="flex items-center text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                  <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                  <span>Google Gemini API key is valid and connected!</span>
                </div>
              )}

              {geminiTextTestResult && !geminiTextTestResult.valid && (
                <div className="flex items-center text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20">
                  <XCircle className="mr-1.5 h-4 w-4" />
                  <span>{geminiTextTestResult.error || "Invalid Gemini API key"}</span>
                </div>
              )}
            </div>

            {/* Gemini Model Selection */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-sm font-semibold">Gemini Writing Model</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {POPULAR_GEMINI_TEXT_MODELS.map((m) => {
                  const isSelected = !isCustomGemini && settings.geminiModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setIsCustomGemini(false);
                        setSettings({ ...settings, geminiModel: m.id });
                      }}
                      className={`text-left p-3.5 rounded-md border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-sepia/50 bg-background/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{m.name}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-sepia/10 text-sepia">
                          {m.tag}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {m.description}
                      </p>
                      <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/80">
                        {m.id}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Custom Gemini Model Toggle */}
              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="customGeminiModelToggle"
                    checked={isCustomGemini}
                    onChange={(e) => {
                      setIsCustomGemini(e.target.checked);
                      if (e.target.checked && !customGeminiModel) {
                        setCustomGeminiModel(settings.geminiModel);
                      }
                    }}
                    className="rounded border-border"
                  />
                  <Label htmlFor="customGeminiModelToggle" className="cursor-pointer text-xs">
                    Use custom Gemini model ID
                  </Label>
                </div>

                {isCustomGemini && (
                  <div className="mt-2 space-y-1">
                    <Input
                      placeholder="e.g. gemini-3.8-flash or gemini-3.8-pro"
                      value={customGeminiModel}
                      onChange={(e) => setCustomGeminiModel(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 2: OPENROUTER TEXT GENERATION                           */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div
            className={`page rounded-lg p-6 space-y-5 border transition-all ${
              settings.textProvider === "openrouter" ? "border-primary/40 ring-1 ring-primary/20" : "opacity-90"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sepia/15 text-sepia">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">OpenRouter (Writing)</h2>
                    {settings.textProvider === "openrouter" && (
                      <span className="bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                        ACTIVE FOR WRITING
                      </span>
                    )}
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
                disabled={testing || !settings.openRouterApiKey.trim()}
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

            {/* Models Grid */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-sm font-semibold">OpenRouter Writing Model</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {POPULAR_MODELS.map((m) => {
                  const isSelected = !isCustom && settings.openRouterModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setIsCustom(false);
                        setSettings({ ...settings, openRouterModel: m.id });
                      }}
                      className={`text-left p-3.5 rounded-md border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-sepia/50 bg-background/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{m.name}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-sepia/10 text-sepia">
                          {m.tag}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {m.description}
                      </p>
                      <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/80">
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
                      placeholder="e.g. meta-llama/llama-3.1-405b-instruct or mistralai/mistral-large"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter any valid model slug available in the OpenRouter models catalog.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SECTION 3: IMAGE GENERATION PROVIDERS (GEMINI / POLLINATIONS / CF) */}
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
                    Configure API keys for storyboard illustration. Google Gemini / Imagen 3, Pollinations, and Cloudflare supported.
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
                      <SelectItem value="gemini">Google Gemini / Imagen 3 (API Key)</SelectItem>
                      <SelectItem value="pollinations">Pollinations AI URL Generator (Fast, Free or Keyed)</SelectItem>
                      <SelectItem value="cloudflare">Cloudflare Workers AI (Account ID + Token)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Gemini / Imagen 3 */}
                <div className="border rounded-md p-4 space-y-3 bg-background/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Google Gemini / Imagen 3</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                            settings.imageProvider === "gemini"
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {settings.imageProvider === "gemini" ? "Active Image Provider" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Generate high-resolution illustrations using Google's Imagen 3 or Gemini multimodal models.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="imageGeminiKey">Gemini Image API Key</Label>
                      {settings.geminiApiKey.trim() && settings.geminiApiKey !== settings.imageGeminiApiKey && (
                        <button
                          type="button"
                          className="text-[11px] text-sepia hover:underline flex items-center gap-1"
                          onClick={() => {
                            setSettings({ ...settings, imageGeminiApiKey: settings.geminiApiKey.trim() });
                            toast.success("Synced Gemini key from writing settings!");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copy from Writing Key
                        </button>
                      )}
                    </div>
                    <div className="relative flex items-center">
                      <Input
                        id="imageGeminiKey"
                        type={showGeminiKey ? "text" : "password"}
                        placeholder="AIzaSy..."
                        className="pr-24 font-mono text-sm"
                        value={settings.imageGeminiApiKey}
                        onChange={(e) => {
                          setSettings({ ...settings, imageGeminiApiKey: e.target.value });
                          setGeminiImageTestResult(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-3 text-muted-foreground hover:text-foreground"
                        aria-label={showGeminiKey ? "Hide key" : "Show key"}
                      >
                        {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline">aistudio.google.com</a>
                    </p>
                  </div>

                  {/* Test Image Gemini Key */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testingGeminiImage || !settings.imageGeminiApiKey.trim()}
                      onClick={handleTestGeminiImageKey}
                    >
                      {testingGeminiImage ? "Testing Gemini Key…" : "Test Gemini Key"}
                    </Button>

                    {geminiImageTestResult && geminiImageTestResult.valid && (
                      <div className="flex items-center text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                        <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                        <span>Gemini API key is valid!</span>
                      </div>
                    )}

                    {geminiImageTestResult && !geminiImageTestResult.valid && (
                      <div className="flex items-center text-xs text-destructive bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20">
                        <XCircle className="mr-1.5 h-4 w-4" />
                        <span>{geminiImageTestResult.error || "Invalid Gemini API key"}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="imageGeminiModel">Model</Label>
                    <div className="space-y-2">
                      <Select
                        value={
                          POPULAR_GEMINI_IMAGE_MODELS.some((m) => m.id === settings.imageGeminiModel)
                            ? settings.imageGeminiModel
                            : "custom"
                        }
                        onValueChange={(val) => {
                          if (val !== "custom") {
                            setSettings({ ...settings, imageGeminiModel: val });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a Gemini model" />
                        </SelectTrigger>
                        <SelectContent>
                          {POPULAR_GEMINI_IMAGE_MODELS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.id})
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom model ID…</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        id="imageGeminiModel"
                        placeholder="e.g. imagen-3.0-generate-002 or gemini-2.5-flash-image"
                        className="font-mono text-sm"
                        value={settings.imageGeminiModel}
                        onChange={(e) => setSettings({ ...settings, imageGeminiModel: e.target.value })}
                      />
                    </div>
                  </div>
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
