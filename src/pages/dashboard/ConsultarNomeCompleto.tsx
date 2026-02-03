import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { moduleService } from "@/utils/apiService";

const MODULE_ID = 156;

interface ModuleData {
  id: number;
  title: string;
  description?: string;
  price?: string | number;
  icon?: string;
  api_endpoint?: string;
}

const ConsultarNomeCompleto = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [moduleData, setModuleData] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    const fetchModuleData = async () => {
      try {
        const response = await moduleService.getById(MODULE_ID);
        if (response.success && response.data) {
          setModuleData(response.data);
        } else {
          toast({
            title: "Erro",
            description: "Módulo não encontrado",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Erro ao carregar módulo:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar dados do módulo",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchModuleData();
  }, [toast]);

  const formatPrice = (price: string | number): string => {
    if (typeof price === "number") {
      return `R$ ${price.toFixed(2).replace(".", ",")}`;
    }
    const numPrice = parseFloat(price.toString().replace(",", "."));
    return `R$ ${numPrice.toFixed(2).replace(".", ",")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nomeCompleto.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, informe o nome completo",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    setResultado(null);

    try {
      // Simula chamada à API - substituir pela chamada real
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      toast({
        title: "Consulta realizada",
        description: "Dados encontrados com sucesso",
      });
      
      setResultado({
        nome: nomeCompleto,
        status: "Consulta realizada com sucesso",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Erro na consulta:", error);
      toast({
        title: "Erro",
        description: "Erro ao realizar consulta",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {moduleData?.title || "Consultar Nome Completo"}
            </h1>
            <p className="text-muted-foreground">
              {moduleData?.description || "Busca por nome completo"}
            </p>
          </div>
        </div>

        {/* Formulário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Realizar Consulta</span>
              {moduleData?.price && (
                <span className="text-sm font-normal text-primary">
                  {formatPrice(moduleData.price)}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Informe o nome completo para realizar a consulta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nomeCompleto">Nome Completo</Label>
                <Input
                  id="nomeCompleto"
                  type="text"
                  placeholder="Digite o nome completo"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  disabled={searching}
                />
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={searching || !nomeCompleto.trim()}
              >
                {searching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Consultar
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Resultado */}
        {resultado && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado da Consulta</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(resultado, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ConsultarNomeCompleto;
