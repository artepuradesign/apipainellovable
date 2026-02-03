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
  Crown, Settings, Copy, ExternalLink, MapPin
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

const ConsultarNomeCompleto = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { modules } = useApiModules();
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [linkManual, setLinkManual] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<NomeConsultaResultado[]>([]);
  const [resultadoLink, setResultadoLink] = useState<string | null>(null);
  const [totalEncontrados, setTotalEncontrados] = useState(0);
  const [logConsulta, setLogConsulta] = useState<string[]>([]);
  const [queryHistory, setQueryHistory] = useState<any[]>([]);
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

  const handleSearch = async () => {
    // Validar entrada
    const hasLinkManual = linkManual && (linkManual.includes('pastebin.sbs') || linkManual.includes('api.fdxapis.us'));
    
    if (!hasLinkManual && (!nomeCompleto || nomeCompleto.trim().length < 5)) {
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

    setLoading(true);
    setResultados([]);
    setResultadoLink(null);
    setTotalEncontrados(0);
    setLogConsulta([]);

    try {
      console.log('🔍 [CONSULTA_NOME] Iniciando consulta por nome:', nomeCompleto || '(link manual)');
      
      // Chamar API externa
      const response = await buscaNomeService.consultarNome(nomeCompleto.trim(), hasLinkManual ? linkManual : undefined);
      
      console.log('📡 [CONSULTA_NOME] Resposta:', response);

      if (response.success && response.data) {
        const data = response.data;
        
        setResultados(data.resultados || []);
        setResultadoLink(data.link);
        setTotalEncontrados(data.total_encontrados);
        setLogConsulta(data.log || []);

        // Registrar consulta no histórico
        const saldoUsado = planBalance >= finalPrice ? 'plano' : 
          (planBalance > 0 && (planBalance + walletBalance) >= finalPrice) ? 'misto' : 'carteira';

        const registroPayload = {
          user_id: parseInt(user.id),
          module_type: 'nome',
          document: nomeCompleto.trim() || linkManual,
          cost: finalPrice,
          status: data.total_encontrados > 0 ? 'completed' : 'naoencontrado',
          result_data: data,
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
            link_resultado: data.link,
            total_encontrados: data.total_encontrados
          }
        };

        try {
          await consultasCpfService.create(registroPayload as any);
          console.log('✅ [CONSULTA_NOME] Consulta registrada no histórico');
        } catch (regError) {
          console.error('❌ [CONSULTA_NOME] Erro ao registrar consulta:', regError);
        }

        if (data.total_encontrados > 0) {
          toast.success(
            <div className="flex flex-col gap-0.5">
              <div>✅ {data.total_encontrados} registro(s) encontrado(s)!</div>
              <div className="text-sm text-muted-foreground">
                Valor cobrado: R$ {finalPrice.toFixed(2)}
              </div>
            </div>,
            { duration: 4000 }
          );
        } else {
          toast.warning("Nenhum registro encontrado para este nome", { duration: 4000 });
        }

        // Atualizar saldo
        await reloadApiBalance();
        loadBalances();
        
        // Deduzir saldo localmente
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

        // Scroll para resultados
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);

        // Atualizar histórico
        setTimeout(() => {
          loadRecentConsultations();
          loadStats();
        }, 1000);

      } else {
        toast.error(response.error || "Erro ao realizar consulta");
      }

    } catch (error) {
      console.error('❌ [CONSULTA_NOME] Erro:', error);
      toast.error("Falha na comunicação com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const copyResultsToClipboard = () => {
    if (resultados.length === 0) return;

    const text = resultados.map(r => 
      `Nome: ${r.nome || '-'}\nCPF: ${r.cpf || '-'}\nNascimento: ${r.nascimento || '-'}\nIdade: ${r.idade || '-'}\nSexo: ${r.sexo || '-'}\nEndereços: ${r.enderecos || '-'}\nCidades: ${r.cidades || '-'}\n---`
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

  return (
    <div className="min-h-screen bg-background">
      <ScrollToTop />
      
      <SimpleTitleBar
        title={currentModule?.title || 'Consulta por Nome Completo'}
        subtitle={currentModule?.description || 'Busque pessoas pelo nome completo'}
        onBack={() => navigate('/dashboard')}
      />
      
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Card de Consulta */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="w-full">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <User className="h-5 w-5 md:h-6 md:w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                      Plano Ativo
                    </p>
                    <h3 className="text-sm md:text-base font-bold text-foreground truncate">
                      {hasActiveSubscription ? subscription?.plan_name : userPlan}
                    </h3>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {hasDiscount && (
                    <span className="text-[10px] md:text-xs text-muted-foreground line-through">
                      R$ {originalPrice.toFixed(2)}
                    </span>
                  )}
                  <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                    R$ {finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nomeCompleto">Nome Completo</Label>
                <Input
                  id="nomeCompleto"
                  placeholder="Digite o nome completo (ex: João da Silva)"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      handleSearch();
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="text-center text-sm text-muted-foreground">OU</div>

              <div className="space-y-2">
                <Label htmlFor="linkManual">Link de Consulta Anterior</Label>
                <Input
                  id="linkManual"
                  placeholder="Cole aqui o link (pastebin.sbs ou api.fdxapis.us)"
                  value={linkManual}
                  onChange={(e) => setLinkManual(e.target.value)}
                />
              </div>

              <Button
                onClick={handleSearch}
                disabled={loading || (!nomeCompleto && !linkManual) || !hasSufficientBalance(finalPrice) || modulePriceLoading}
                className="w-full bg-brand-purple hover:bg-brand-darkPurple"
              >
                <Search className="mr-2 h-4 w-4" />
                {loading ? "Consultando..." : modulePriceLoading ? "Carregando..." : `Consultar (R$ ${finalPrice.toFixed(2)})`}
              </Button>

              {!hasSufficientBalance(finalPrice) && (nomeCompleto || linkManual) && (
                <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-start text-destructive">
                    <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs sm:text-sm block">
                        Saldo insuficiente. Necessário: R$ {finalPrice.toFixed(2)}
                      </span>
                      <span className="text-xs sm:text-sm block">
                        Disponível: R$ {totalBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card de Estatísticas */}
          {!isMobile && (
            <Card className="w-full">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-lg">
                  <FileText className="mr-2 h-5 w-5" />
                  Estatísticas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total de Consultas</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-success">{stats.completed}</p>
                    <p className="text-xs text-muted-foreground">Sucesso</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{stats.today}</p>
                    <p className="text-xs text-muted-foreground">Hoje</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{stats.this_month}</p>
                    <p className="text-xs text-muted-foreground">Este Mês</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Resultados da Consulta */}
        {resultados.length > 0 && (
          <Card ref={resultRef} className="w-full border-success-border">
            <CardHeader className="bg-success-subtle">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center text-success-subtle-foreground">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  <span>{totalEncontrados} Registro(s) Encontrado(s)</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  {resultadoLink && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(resultadoLink, '_blank')}
                      className="text-success-subtle-foreground"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Ver Link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyResultsToClipboard}
                    className="h-8 w-8"
                    title="Copiar resultados"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Nome</TableHead>
                      <TableHead className="min-w-[130px]">CPF</TableHead>
                      <TableHead className="min-w-[100px]">Nascimento</TableHead>
                      <TableHead className="w-20">Idade</TableHead>
                      <TableHead className="w-20">Sexo</TableHead>
                      <TableHead className="min-w-[250px]">Endereços</TableHead>
                      <TableHead className="min-w-[150px]">Cidades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultados.map((resultado, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{resultado.nome || '—'}</TableCell>
                        <TableCell className="font-mono text-sm">{resultado.cpf || '—'}</TableCell>
                        <TableCell>{resultado.nascimento || '—'}</TableCell>
                        <TableCell>{resultado.idade || '—'}</TableCell>
                        <TableCell>{resultado.sexo || '—'}</TableCell>
                        <TableCell className="whitespace-pre-line text-xs">{resultado.enderecos || '—'}</TableCell>
                        <TableCell>{resultado.cidades || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Consultas */}
        <Card className="w-full">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center text-lg">
              <FileText className="mr-2 h-5 w-5" />
              Últimas Consultas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentConsultationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="md" />
                <span className="ml-3 text-muted-foreground">Carregando...</span>
              </div>
            ) : recentConsultations.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome Consultado</TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentConsultations.map((consultation) => (
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
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {consultation.document || '-'}
                        </TableCell>
                        <TableCell>{formatFullDate(consultation.created_at)}</TableCell>
                        <TableCell className="text-right">
                          R$ {Number(consultation.cost || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={consultation.status === 'completed' ? 'default' : 'secondary'}>
                            {consultation.status === 'completed' ? 'Concluída' : 'Pendente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma consulta realizada ainda</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConsultarNomeCompleto;
