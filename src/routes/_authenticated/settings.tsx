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
  type AiSettings,
} from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Inkwell" },
      { name: "description", content: "Configure your AI provider and OpenRouter API key." },
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
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    valid?: boolean | undefined;
    label?: string | undefined;
    usage?: number | undefined;
    limit?: number | null | undefined;
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
    });
  }, [uid]);

  async function handleTestKey() {
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedModel = isCustom ? customModel.trim() : settings.openRouterModel;
      if (!selectedModel) {
        toast.error("Please select or enter an AI model.");
        setSaving(false);
        return;
      }

      await saveAiSettings(
        {
          openRouterApiKey: settings.openRouterApiKey.trim(),
          openRouterModel: selectedModel,
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
          Connect your OpenRouter account to unlock Claude, GPT-4, DeepSeek, and open models for
          intelligent writing assistance.
        </p>

        <form onSubmit={handleSave} className="mt-8 space-y-8">
          {/* OpenRouter API Key Card */}
          <div className="page rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sepia/15 text-sepia">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">OpenRouter API Key</h2>
                  <p className="text-xs text-muted-foreground">
                    Required for AI drafting, rewriting, and scene breakdown
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
              <Label htmlFor="openRouterKey">API Key</Label>
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
                onClick={handleTestKey}
              >
                {testing ? "Testing connection…" : "Test API Key"}
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
          </div>

          {/* Model Selection Card */}
          <div className="page rounded-lg p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sepia/15 text-sepia">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Select AI Model</h2>
                <p className="text-xs text-muted-foreground">
                  Choose the model that shapes the tone and voice of your writing assistant
                </p>
              </div>
            </div>

            {/* Models Grid */}
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
                    className={`text-left p-4 rounded-md border transition-all ${
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
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                      {m.description}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
                      {m.id}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Custom Model Toggle */}
            <div className="pt-2 border-t border-border">
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
                <Label htmlFor="customModelToggle" className="cursor-pointer text-sm">
                  Use custom OpenRouter model ID
                </Label>
              </div>

              {isCustom && (
                <div className="mt-3 space-y-1.5">
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
