import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { 
  User, Search, AlertCircle, CheckCircle, FileText, 
  Crown, Settings, Copy, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { getPlanType } from '@/utils/planUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useUserSubscription } from '@/hooks/useUserSubscription';
import { consultasCpfService } from '@/services/consultasCpfService';
import { consultationApiService } from '@/services/consultationApiService';
import { cookieUtils } from '@/utils/cookieUtils';
import { getModulePrice } from '@/utils/modulePrice';
import { useApiModules } from '@/hooks/useApiModules';
import LoadingSpinner from '@/components/ui/loading-spinner';
import SimpleTitleBar from '@/components/dashboard/SimpleTitleBar';
import ScrollToTop from '@/components/ui/scroll-to-top';
import { buscaNomeService, NomeConsultaResultado, NomeConsultaResponse } from '@/services/buscaNomeService';
import { parseFdxHtmlResults } from '@/utils/fdxHtmlResultsParser';

const ConsultarNomeCompleto = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { modules } = useApiModules();
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Modal de processamento (igual ao /dashboard/consultar-cpf-simples)
  const [verificationLoadingOpen, setVerificationLoadingOpen] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [verificationPhase, setVerificationPhase] = useState<'initial' | null>(null);
  const [verificationSecondsLeft, setVerificationSecondsLeft] = useState<number | null>(null);

  const [resultados, setResultados] = useState<NomeConsultaResultado[]>([]);
  const [resultadoLink, setResultadoLink] = useState<string | null>(null);
  const [totalEncontrados, setTotalEncontrados] = useState(0);
  const [logConsulta, setLogConsulta] = useState<string[]>([]);
  const [recentConsultations, setRecentConsultations] = useState<any[]>([]);
  const [recentConsultationsLoading, setRecentConsultationsLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [planBalance, setPlanBalance] = useState(0);
  const [modulePrice, setModulePrice] = useState(0);
  const [modulePriceLoading, setModulePriceLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    today: 0,
    this_month: 0,
    total_cost: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const isMobile = useIsMobile();
  const resultRef = useRef<HTMLDivElement>(null);
  const progressTimerRef = useRef<number | null>(null);
  const { user } = useAuth();
  
  const { balance, loadBalance: reloadApiBalance } = useWalletBalance();
  
  const { 
    hasActiveSubscription, 
    subscription, 
    planInfo, 
    discountPercentage,
    calculateDiscountedPrice: calculateSubscriptionDiscount,
    isLoading: subscriptionLoading 
  } = useUserSubscription();

  // Buscar módulo atual pela rota
  const currentModule = useMemo(() => {
    const normalizeModuleRoute = (module: any): string => {
      const raw = (module?.api_endpoint || module?.path || '').toString().trim();
      if (!raw) return '';
      if (raw.startsWith('/')) return raw;
      if (raw.startsWith('dashboard/')) return `/${raw}`;
      if (!raw.includes('/')) return `/dashboard/${raw}`;
      return raw;
    };

    const pathname = (location?.pathname || '').trim();
    if (!pathname) return null;

    return (modules || []).find((m: any) => normalizeModuleRoute(m) === pathname) || null;
  }, [modules, location?.pathname]);

  const userPlan = hasActiveSubscription && subscription 
    ? subscription.plan_name 
    : (user ? localStorage.getItem(`user_plan_${user.id}`) || "Pré-Pago" : "Pré-Pago");

  const planType = getPlanType(userPlan);

  // Carregar saldo da API
  useEffect(() => {
    if (user) {
      loadBalances();
      reloadApiBalance();
      loadRecentConsultations();
      loadStats();
    }
  }, [user, reloadApiBalance]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    loadModulePrice();
  }, [user, currentModule?.id]);

  useEffect(() => {
    if (balance.saldo !== undefined || balance.saldo_plano !== undefined) {
      loadBalances();
    }
  }, [balance]);

  const loadBalances = () => {
    if (!user) return;
    const apiPlanBalance = balance.saldo_plano || 0;
    const apiWalletBalance = balance.saldo || 0;
    setPlanBalance(apiPlanBalance);
    setWalletBalance(apiWalletBalance);
  };

  const loadModulePrice = () => {
    setModulePriceLoading(true);
    const rawPrice = currentModule?.price;
    const price = Number(rawPrice ?? 0);

    if (price && price > 0) {
      setModulePrice(price);
      setModulePriceLoading(false);
      return;
    }

    const fallbackPrice = getModulePrice(location.pathname || '/dashboard/consultar-nome-completo');
    setModulePrice(fallbackPrice);
    setModulePriceLoading(false);
  };

  const loadRecentConsultations = async () => {
    if (!user) return;
    
    try {
      setRecentConsultationsLoading(true);
      const response = await consultationApiService.getConsultationHistory(50, 0);
      
      if (response.success && response.data && Array.isArray(response.data)) {
        const nomeConsultations = response.data
          .filter((item: any) => (item?.metadata?.page_route || '') === window.location.pathname)
          .map((consultation: any) => ({
            id: `consultation-${consultation.id}`,
            type: 'consultation',
            module_type: 'NOME COMPLETO',
            document: consultation.document,
            cost: consultation.cost,
            status: consultation.status,
            created_at: consultation.created_at,
            result_data: consultation.result_data,
            metadata: consultation.metadata
          }))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);
        
        setRecentConsultations(nomeConsultations);
      } else {
        setRecentConsultations([]);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar consultas:', error);
      setRecentConsultations([]);
    } finally {
      setRecentConsultationsLoading(false);
    }
  };

  const loadStats = async () => {
    if (!user) {
      setStatsLoading(false);
      return;
    }
    
    setStatsLoading(true);
    
    try {
      const response = await consultationApiService.getConsultationHistory(1000, 0);
      
      if (response.success && Array.isArray(response.data) && response.data.length > 0) {
        const nomeConsultations = response.data.filter((c: any) => 
          (c?.metadata?.page_route || '') === window.location.pathname
        );
        
        const todayStr = new Date().toDateString();
        const now = new Date();
        
        const computed = nomeConsultations.reduce((acc: any, item: any) => {
          acc.total += 1;
          const st = item.status || 'completed';
          if (st === 'completed') acc.completed += 1;
          else if (st === 'failed') acc.failed += 1;
          acc.total_cost += Number(item.cost || 0);
          const d = new Date(item.created_at);
          if (d.toDateString() === todayStr) acc.today += 1;
          if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) acc.this_month += 1;
          return acc;
        }, { total: 0, completed: 0, failed: 0, processing: 0, today: 0, this_month: 0, total_cost: 0 });
        
        setStats(computed);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar estatísticas:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const totalBalance = planBalance + walletBalance;
  const hasSufficientBalance = (amount: number) => {
    return planBalance >= amount || (planBalance + walletBalance) >= amount;
  };

  // Calcular preço com desconto
  const originalPrice = modulePrice;
  const { discountedPrice: finalPrice, hasDiscount } = hasActiveSubscription 
    ? calculateSubscriptionDiscount(originalPrice)
    : { discountedPrice: originalPrice, hasDiscount: false };
  const discount = hasDiscount ? discountPercentage : 0;

  const inputValue = (nomeCompleto || '').trim();
  const isManualLink = inputValue.includes('pastebin.sbs') || inputValue.includes('api.fdxapis.us');
  const canSearch = isManualLink || inputValue.length >= 5;

  const startFakeProgress = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    setVerificationProgress(8);
    const startedAt = Date.now();
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setVerificationSecondsLeft(elapsed);
      setVerificationProgress((prev) => {
        const next = Math.min(prev + Math.max(1, Math.round(Math.random() * 6)), 95);
        return next;
      });
    }, 900);
  };

  const handleSearch = async () => {
    if (!canSearch) {
      toast.error("Digite um nome válido (mínimo 5 caracteres) ou cole um link de consulta anterior");
      return;
    }

    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    const sessionToken = cookieUtils.get('session_token') || cookieUtils.get('api_session_token');
    if (!sessionToken) {
      toast.error("Token de autenticação não encontrado. Faça login novamente.");
      return;
    }

    if (!hasSufficientBalance(finalPrice)) {
      toast.error(`Saldo insuficiente. Necessário: R$ ${finalPrice.toFixed(2)}, Disponível: R$ ${totalBalance.toFixed(2)}`);
      return;
    }

    // Tempo mínimo de exibição do modal (5 segundos)
    const minDisplayMs = 5000;
    const startTime = Date.now();

    // Abrir modal imediatamente
    setVerificationLoadingOpen(true);
    setVerificationPhase('initial');
    setVerificationSecondsLeft(0);
    setLogConsulta([
      isManualLink ? 'Consulta direta via link manual...' : 'Enviando nome para consulta...'
    ]);
    startFakeProgress();

    setLoading(true);
    setResultados([]);
    setResultadoLink(null);
    setTotalEncontrados(0);

    const waitRemainingTime = async () => {
      const elapsed = Date.now() - startTime;
      if (elapsed < minDisplayMs) {
        await new Promise((resolve) => setTimeout(resolve, minDisplayMs - elapsed));
      }
    };

    try {
      console.log('🔍 [CONSULTA_NOME] Iniciando consulta por nome:', nomeCompleto || '(link manual)');
      
      const response = await buscaNomeService.consultarNome(
        isManualLink ? '' : inputValue,
        isManualLink ? inputValue : undefined
      );
      
      console.log('📡 [CONSULTA_NOME] Resposta:', response);

      if (response.success && response.data) {
        const data = response.data;

        // Em alguns casos a API retorna apenas o link (HTML com tabela) e não popula `resultados`.
        // Então tentamos buscar/parsing do link para preencher Nome/CPF/Nascimento.
        let finalResultados: NomeConsultaResultado[] = Array.isArray(data.resultados) ? data.resultados : [];
        let finalTotal = Number(data.total_encontrados || 0);
        const finalLink = data.link || null;

        setResultadoLink(finalLink);
        setLogConsulta(data.log || []);

        const shouldTryParseLink = (!!finalLink && (finalResultados.length === 0 || finalTotal === 0));
        if (shouldTryParseLink) {
          setLogConsulta((prev) => [...prev, '🔄 Carregando resultados do link...']);
          try {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 45000);
            const linkResp = await fetch(finalLink!, {
              method: 'GET',
              signal: controller.signal,
            });
            const html = await linkResp.text();
            window.clearTimeout(timeoutId);

            const parsed = parseFdxHtmlResults(html);
            if (parsed.length > 0) {
              finalResultados = parsed;
              finalTotal = parsed.length;
              setLogConsulta((prev) => [...prev, `✅ ${parsed.length} registro(s) carregado(s) do link`]);
            } else {
              setLogConsulta((prev) => [...prev, '⚠️ Link retornou dados sem tabela (ou vazio).']);
            }
          } catch (e) {
            // Se der erro (CORS/timeout), ainda deixamos o botão "Ver Link" disponível.
            setLogConsulta((prev) => [...prev, '⚠️ Não foi possível carregar o link automaticamente. Use "Ver Link".']);
          }
        }

        // Normalizar payload para UI + histórico
        const normalizedData: NomeConsultaResponse = {
          ...data,
          resultados: finalResultados,
          total_encontrados: finalTotal,
          link: finalLink || data.link,
        };

        setResultados(normalizedData.resultados || []);
        setTotalEncontrados(normalizedData.total_encontrados || 0);

        // Registrar consulta no histórico
        const saldoUsado = planBalance >= finalPrice ? 'plano' : 
          (planBalance > 0 && (planBalance + walletBalance) >= finalPrice) ? 'misto' : 'carteira';

        const registroPayload = {
          user_id: parseInt(user.id),
          module_type: 'nome',
          document: inputValue,
          cost: finalPrice,
          status: normalizedData.total_encontrados > 0 ? 'completed' : 'naoencontrado',
          result_data: normalizedData,
          ip_address: window.location.hostname,
          user_agent: navigator.userAgent,
          saldo_usado: saldoUsado,
          metadata: {
            source: 'consultar-nome-completo',
            page_route: window.location.pathname,
            module_title: currentModule?.title || 'NOME COMPLETO',
            discount: discount,
            original_price: originalPrice,
            discounted_price: finalPrice,
            final_price: finalPrice,
            subscription_discount: hasActiveSubscription,
            plan_type: userPlan,
            module_id: 156,
            timestamp: new Date().toISOString(),
            saldo_usado: saldoUsado,
            link_resultado: normalizedData.link,
            total_encontrados: normalizedData.total_encontrados
          }
        };

        try {
          await consultasCpfService.create(registroPayload as any);
          console.log('✅ [CONSULTA_NOME] Consulta registrada no histórico');
        } catch (regError) {
          console.error('❌ [CONSULTA_NOME] Erro ao registrar consulta:', regError);
        }

        if (normalizedData.total_encontrados > 0) {
          toast.success(
            <div className="flex flex-col gap-0.5">
              <div>✅ {normalizedData.total_encontrados} registro(s) encontrado(s)!</div>
              <div className="text-sm text-muted-foreground">
                Valor cobrado: R$ {finalPrice.toFixed(2)}
              </div>
            </div>,
            { duration: 4000 }
          );
        } else {
          toast.warning("Nenhum registro encontrado para este nome", { duration: 4000 });
        }

        await reloadApiBalance();
        loadBalances();
        
        if (saldoUsado === 'plano') {
          setPlanBalance(Math.max(0, planBalance - finalPrice));
        } else if (saldoUsado === 'misto') {
          const remaining = Math.max(0, finalPrice - planBalance);
          setPlanBalance(0);
          setWalletBalance(Math.max(0, walletBalance - remaining));
        } else {
          setWalletBalance(Math.max(0, walletBalance - finalPrice));
        }

        window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: { shouldAnimate: true, immediate: true } }));

        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);

        setTimeout(() => {
          loadRecentConsultations();
          loadStats();
        }, 1000);

      } else {
        setLogConsulta((prev) => [...prev, `ERRO: ${response.error || 'Erro ao realizar consulta'}`]);
        toast.error(response.error || "Erro ao realizar consulta");
      }

      await waitRemainingTime();

    } catch (error) {
      console.error('❌ [CONSULTA_NOME] Erro:', error);
      setLogConsulta((prev) => [...prev, `ERRO: ${error instanceof Error ? error.message : 'Falha na comunicação'}`]);
      toast.error("Falha na comunicação com o servidor");

      const elapsedMs = Date.now() - startTime;
      if (elapsedMs < minDisplayMs) {
        await new Promise((resolve) => setTimeout(resolve, minDisplayMs - elapsedMs));
      }
    } finally {
      setLoading(false);

      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setVerificationProgress(100);

      await new Promise((r) => setTimeout(r, 500));

      setVerificationLoadingOpen(false);
      setVerificationSecondsLeft(null);
      setVerificationPhase(null);
      setVerificationProgress(0);
    }
  };

  const copyResultsToClipboard = () => {
    if (resultados.length === 0) return;

    const text = resultados.map(r => 
      `Nome: ${r.nome || '-'}\nCPF: ${r.cpf || '-'}\nNascimento: ${r.nascimento || '-'}\n---`
    ).join('\n');

    navigator.clipboard.writeText(text);
    toast.success('Resultados copiados!');
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/dashboard');
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-full overflow-x-hidden">
      <ScrollToTop />

      {/* TÍTULO */}
      <SimpleTitleBar
        title={currentModule?.title || 'Consulta por Nome Completo'}
        subtitle={currentModule?.description || 'Busque pessoas pelo nome completo'}
        icon={<Search className="h-4 w-4 md:h-5 md:w-5" />}
        onBack={handleBack}
      />

      {/* Grid principal - Layout igual ao consultar-cpf-simples */}
      <div className="mt-4 md:mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 md:gap-6 lg:gap-8">
        {/* Formulário de Consulta */}
        <Card className="dark:bg-gray-800 dark:border-gray-700 w-full">
          <CardHeader className="pb-4">
            {/* Compact Price Display */}
            <div className="relative bg-gradient-to-br from-purple-50/50 via-white to-blue-50/30 dark:from-gray-800/50 dark:via-gray-800 dark:to-purple-900/20 rounded-lg border border-purple-100/50 dark:border-purple-800/30 shadow-sm transition-all duration-300">
              {/* Badge de desconto centralizado no topo */}
              {hasDiscount && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10 pointer-events-none">
                  <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 px-2.5 py-1 text-xs font-bold shadow-lg">
                    {discount}% OFF
                  </Badge>
                </div>
              )}
              
              <div className="relative p-3.5 md:p-4">
                <div className="flex items-center justify-between gap-4">
                  {/* Nome do plano - Esquerda */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-1 h-10 bg-gradient-to-b from-purple-500 to-blue-500 rounded-full flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
                        Plano Ativo
                      </p>
                      <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-white truncate">
                        {hasActiveSubscription ? subscription?.plan_name : userPlan}
                      </h3>
                    </div>
                  </div>
                  
                  {/* Preço - Direita */}
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    {hasDiscount && (
                      <span className="text-[10px] md:text-xs text-gray-400 dark:text-gray-500 line-through">
                        R$ {originalPrice.toFixed(2)}
                      </span>
                    )}
                    <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                      R$ {finalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nomeCompleto">Nome Completo ou Link</Label>
              <Input
                id="nomeCompleto"
                placeholder="Ex: Maria da Silva ou cole o link..."
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && canSearch && !loading && hasSufficientBalance(finalPrice) && !modulePriceLoading) {
                    handleSearch();
                  }
                }}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleSearch}
                disabled={loading || !canSearch || !hasSufficientBalance(finalPrice) || modulePriceLoading}
                className="w-full bg-brand-purple hover:bg-brand-darkPurple"
              >
                <Search className="mr-2 h-4 w-4" />
                {loading ? "Consultando..." : modulePriceLoading ? "Carregando preço..." : `Consultar Nome (R$ ${finalPrice.toFixed(2)})`}
              </Button>
            </div>

            {/* Modal de Verificação */}
            <Dialog open={verificationLoadingOpen} onOpenChange={setVerificationLoadingOpen}>
              <DialogContent className="sm:max-w-[320px]">
                <DialogHeader>
                  <DialogTitle className="text-center">Processando Consulta</DialogTitle>
                  <DialogDescription className="text-center">
                    Aguarde a exibição das informações
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-4 py-6">
                  <div className="relative">
                    <div className="w-16 h-16 bg-gradient-to-br from-brand-purple/20 to-pink-500/20 rounded-full flex items-center justify-center">
                      <LoadingSpinner size="lg" className="text-brand-purple" />
                    </div>
                    <div className="absolute inset-0 w-16 h-16 bg-gradient-to-br from-brand-purple/10 to-pink-500/10 rounded-full animate-ping"></div>
                  </div>

                  <div className="w-full max-w-xs space-y-2">
                    <Progress value={verificationProgress} className="w-full" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{verificationProgress}%</span>
                      <span>{verificationSecondsLeft ?? 0}s</span>
                    </div>

                    <div className="w-full rounded-md border border-border bg-muted/30 p-2 max-h-32 overflow-auto">
                      <pre className="text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap">
                        {(logConsulta && logConsulta.length > 0) ? logConsulta.join('\n') : 'Iniciando...'}
                      </pre>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            {/* Indicador de saldo insuficiente */}
            {!hasSufficientBalance(finalPrice) && canSearch && (
              <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg space-y-3">
                <div className="flex items-start text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs sm:text-sm block break-words">
                      Saldo insuficiente. Necessário: R$ {finalPrice.toFixed(2)}
                    </span>
                    <span className="text-xs sm:text-sm block break-words">
                      Disponível: R$ {totalBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-red-600 dark:text-red-400 break-words">
                  Saldo do plano: R$ {planBalance.toFixed(2)} | Saldo da carteira: R$ {walletBalance.toFixed(2)}
                </div>
                <Button
                  onClick={() => navigate('/dashboard/historico')}
                  variant="outline"
                  size="sm"
                  className="w-full border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <FileText className="mr-2 h-3 w-3" />
                  Ver Histórico de Consultas
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Consulta Personalizada (desktop apenas) */}
        {!isMobile && (
          <Card className="dark:bg-gray-800 dark:border-gray-700 w-full">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center text-lg sm:text-xl lg:text-2xl">
                <Settings className="mr-2 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">Consulta Personalizada</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">
                  Escolha as informações desejadas e otimize seus créditos e resultados.
                </p>
                
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                  <div className="flex items-center mb-2">
                    <Crown className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600 mr-2 flex-shrink-0" />
                    <span className="text-xs sm:text-sm font-medium text-purple-700 dark:text-purple-300 truncate">
                      Exclusivo para Planos Reis
                    </span>
                  </div>
                  <p className="text-xs text-purple-600 dark:text-purple-400 break-words">
                    Personalize suas consultas e pague apenas pelos dados que precisa
                  </p>
                </div>

                {planType === 'rei' ? (
                  <Link to="/dashboard/consultar-cpf-completa">
                    <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                      <Settings className="mr-2 h-4 w-4" />
                      Acessar Consulta Personalizada
                    </Button>
                  </Link>
                ) : (
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full text-purple-600 border-purple-600 hover:bg-purple-50"
                      onClick={() => {
                        toast.info("Faça upgrade para plano REI para acessar a Consulta Personalizada", {
                          description: "Personalize suas consultas e pague apenas pelos dados que precisa",
                          duration: 5000
                        });
                      }}
                    >
                      Fazer Upgrade para Rei
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* RESULTADO */}
      {resultados.length > 0 && (
        <Card ref={resultRef} className="dark:bg-gray-800 dark:border-gray-700 w-full">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className={`flex items-center text-green-600 dark:text-green-400 ${isMobile ? 'text-base' : 'text-lg sm:text-xl'}`}>
                <CheckCircle className={`mr-2 flex-shrink-0 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                <span className="truncate">{totalEncontrados} Registro(s) Encontrado(s)</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {resultadoLink && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(resultadoLink, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Ver Link
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyResultsToClipboard}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Mobile: Cards */}
            {isMobile ? (
              <div className="space-y-3">
                {resultados.map((resultado, index) => (
                  <div key={index} className="p-3 bg-muted/50 rounded-lg border">
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-muted-foreground">Nome</span>
                        <p className="font-medium text-sm">{resultado.nome || '—'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-xs text-muted-foreground">CPF</span>
                          <p className="font-mono text-sm">{resultado.cpf || '—'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Nascimento</span>
                          <p className="text-sm">{resultado.nascimento || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Desktop: Table */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Nome</TableHead>
                      <TableHead className="min-w-[130px]">CPF</TableHead>
                      <TableHead className="min-w-[100px]">Nascimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultados.map((resultado, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{resultado.nome || '—'}</TableCell>
                        <TableCell className="font-mono text-sm">{resultado.cpf || '—'}</TableCell>
                        <TableCell>{resultado.nascimento || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ÚLTIMAS CONSULTAS */}
      <Card className="dark:bg-gray-800 dark:border-gray-700 w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className={`flex items-center ${isMobile ? 'text-base' : 'text-lg sm:text-xl'}`}>
              <FileText className={`mr-2 flex-shrink-0 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
              <span className="truncate">Últimas Consultas</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {recentConsultationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <span className="ml-3 text-muted-foreground">Carregando consultas...</span>
            </div>
          ) : recentConsultations.length > 0 ? (
            <>
              {isMobile ? (
                <div className="space-y-2">
                  {recentConsultations.map((consultation) => (
                    <button
                      key={consultation.id}
                      type="button"
                      onClick={() => {
                        if (consultation.result_data) {
                          setResultados(consultation.result_data.resultados || []);
                          setResultadoLink(consultation.result_data.link);
                          setTotalEncontrados(consultation.result_data.total_encontrados || 0);
                          setNomeCompleto(consultation.document);
                          toast.success('Consulta carregada do histórico (sem cobrança)');
                          setTimeout(() => {
                            resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }
                      }}
                      className="w-full text-left rounded-md border border-border bg-card px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-xs truncate">
                            {consultation.document || 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatFullDate(consultation.created_at)}
                          </div>
                        </div>
                        <span
                          className={
                            consultation.status === 'completed'
                              ? 'mt-0.5 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-green-500'
                              : 'mt-0.5 inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-muted'
                          }
                          aria-label={consultation.status === 'completed' ? 'Concluída' : 'Pendente'}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Nome Consultado</TableHead>
                      <TableHead className="min-w-[180px]">Data e Hora</TableHead>
                      <TableHead className="w-28 text-right">Valor</TableHead>
                      <TableHead className="w-28 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentConsultations.map((consultation) => {
                      const consultationValue = consultation.cost || 0;
                      const numericValue = typeof consultationValue === 'string'
                        ? parseFloat(consultationValue.replace(',', '.'))
                        : Number(consultationValue) || 0;

                      return (
                        <TableRow
                          key={consultation.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            if (consultation.result_data) {
                              setResultados(consultation.result_data.resultados || []);
                              setResultadoLink(consultation.result_data.link);
                              setTotalEncontrados(consultation.result_data.total_encontrados || 0);
                              setNomeCompleto(consultation.document);
                              toast.success('Consulta carregada do histórico (sem cobrança)');
                              setTimeout(() => {
                                resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }, 100);
                            }
                          }}
                        >
                          <TableCell className="font-medium text-sm">
                            {consultation.document || '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatFullDate(consultation.created_at)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-red-600 dark:text-red-400">
                            R$ {numericValue.toFixed(2).replace('.', ',')}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={consultation.status === 'completed' ? 'secondary' : 'outline'}
                              className={
                                consultation.status === 'completed'
                                  ? 'text-xs rounded-full bg-foreground text-background hover:bg-foreground/90'
                                  : 'text-xs rounded-full'
                              }
                            >
                              {consultation.status === 'completed' ? 'Concluída' : 'Pendente'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhuma consulta realizada ainda</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards - Igual ao ConsultarCpfSimples */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <Card className="w-full">
          <CardContent className="p-3 sm:p-4">
            <div className="text-center">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-primary truncate">
                {statsLoading ? '...' : stats.today}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">Consultas Hoje</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="w-full">
          <CardContent className="p-3 sm:p-4">
            <div className="text-center">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-primary truncate">
                {statsLoading ? '...' : stats.total}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">Total de Consultas</p>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardContent className="p-3 sm:p-4">
            <div className="text-center">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-green-600 truncate">
                {statsLoading ? '...' : stats.completed}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">Concluídas</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="w-full">
          <CardContent className="p-3 sm:p-4">
            <div className="text-center">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-primary truncate">
                R$ {statsLoading ? '0,00' : stats.total_cost.toFixed(2)}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">Total Gasto</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConsultarNomeCompleto;
