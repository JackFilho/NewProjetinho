import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Send, Eye, Calendar, User, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { FloatingHelpButton } from "@/components/floating-help-button";

interface ProfessionalReview {
  id: number;
  professionalId: number;
  appointmentId: number;
  clientPhone: string;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  createdAt: string;
  professional: {
    name: string;
  };
  appointment: {
    clientName: string;
    appointmentDate: string;
    appointmentTime: string;
  };
}

interface ReviewInvitation {
  id: number;
  appointmentId: number;
  professionalId: number;
  clientPhone: string;
  clientName: string;
  appointmentDate: string;
  appointmentTime: string;
  invitationToken: string;
  reviewSubmittedAt: string | null;
  status: string;
  createdAt: string;
  professional: {
    name: string;
  };
  appointment: {
    clientName: string;
    appointmentDate: string;
    appointmentTime: string;
  };
}

export default function CompanyReviews() {
  const { company } = useCompanyAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState('reviews');
  const [filterProfessional, setFilterProfessional] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Fetch professionals for filter
  const { data: professionals = [] } = useQuery({
    queryKey: ['/api/company/professionals'],
    enabled: !!company?.id,
  });

  // Fetch professional reviews
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['/api/company/reviews'],
    enabled: !!company?.id,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch review invitations
  const { data: invitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ['/api/company/review-invitations'],
    enabled: !!company?.id,
    staleTime: 0,
    gcTime: 0,
  });

  // Send review invitation mutation
  const sendInvitationMutation = useMutation({
    mutationFn: (appointmentId: number) =>
      apiRequest(`/api/appointments/${appointmentId}/send-review-invitation`, 'POST'),
    onSuccess: () => {
      toast({
        title: "Convite enviado!",
        description: "O convite de avaliação foi enviado via WhatsApp.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/company/review-invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar convite",
        description: error.message || "Erro ao enviar convite de avaliação",
        variant: "destructive",
      });
    },
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const formatTime = (timeString: string) => {
    return timeString ? timeString.slice(0, 5) : '';
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-2 text-sm text-gray-600">({rating})</span>
      </div>
    );
  };

  const getStatusBadge = (invitation: ReviewInvitation) => {
    if (invitation.reviewSubmittedAt) {
      return <Badge variant="default">Respondido</Badge>;
    }

    const daysSinceCreated = Math.floor(
      (new Date().getTime() - new Date(invitation.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceCreated > 7) {
      return <Badge variant="secondary">Expirado</Badge>;
    }

    return <Badge variant="outline">Pendente</Badge>;
  };

  // Filter and sort reviews
  const filteredReviews = reviews
    .filter((review: any) => {
      if (filterProfessional === 'all') return true;
      return review.professionalId?.toString() === filterProfessional;
    })
    .sort((a: any, b: any) => {
      // Sort by most recent first (createdAt descending)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Pagination logic for reviews
  const totalReviews = filteredReviews.length;
  const totalPages = Math.ceil(totalReviews / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

  // Reset to first page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterProfessional]);

  if (!company) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold ml-16 sm:ml-0">Sistema de Avaliações</h1>
          <p className="text-gray-600">
            Gerencie as avaliações dos seus profissionais e envie convites aos clientes
          </p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="reviews">Avaliações Recebidas</TabsTrigger>
          <TabsTrigger value="invitations">Convites Enviados</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Avaliações dos Profissionais
              </CardTitle>
              <CardDescription>
                Visualize todas as avaliações recebidas pelos seus profissionais
              </CardDescription>

              {/* Filter by professional */}
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Filtrar por profissional:
                </label>
                <Select value={filterProfessional} onValueChange={setFilterProfessional}>
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Selecione um profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os profissionais</SelectItem>
                    {professionals.map((prof: any) => (
                      <SelectItem key={prof.id} value={prof.id.toString()}>
                        {prof.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {reviewsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : !filteredReviews || filteredReviews.length === 0 ? (
                <div className="text-center py-8">
                  <Star className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhuma avaliação encontrada
                  </h3>
                  <p className="text-gray-500">
                    {filterProfessional === 'all'
                      ? 'As avaliações dos seus profissionais aparecerão aqui'
                      : 'Nenhuma avaliação encontrada para este profissional'}
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Data do Atendimento</TableHead>
                        <TableHead>Avaliação</TableHead>
                        <TableHead>Comentário</TableHead>
                        <TableHead>Data da Avaliação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReviews.map((review: any) => (
                          <TableRow key={review.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-500" />
                                {review.professionalName || 'N/A'}
                              </div>
                            </TableCell>
                            <TableCell>{review.clientName || 'N/A'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-500" />
                                {review.appointmentDate ? formatDate(review.appointmentDate) : 'N/A'} {review.appointmentTime ? `às ${formatTime(review.appointmentTime)}` : ''}
                              </div>
                            </TableCell>
                            <TableCell>{renderStars(review.rating)}</TableCell>
                            <TableCell className="max-w-xs">
                              {review.comment ? (
                                <div className="flex items-start gap-2">
                                  <MessageSquare className="h-4 w-4 text-gray-500 mt-0.5" />
                                  <span className="text-sm">{review.comment}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">Sem comentário</span>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(review.createdAt)}</TableCell>
                          </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-gray-700">
                        Mostrando {startIndex + 1} - {Math.min(endIndex, totalReviews)} de {totalReviews} avaliações
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <span className="text-sm text-gray-700">
                          Página {currentPage} de {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          Próxima
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-500" />
                Convites de Avaliação
              </CardTitle>
              <CardDescription>
                Acompanhe os convites de avaliação enviados aos clientes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : invitations.length === 0 ? (
                <div className="text-center py-8">
                  <Send className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nenhum convite enviado
                  </h3>
                  <p className="text-gray-500">
                    Os convites de avaliação enviados aparecerão aqui
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Data do Atendimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data do Envio</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation: ReviewInvitation) => (
                      <TableRow key={invitation.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-500" />
                            {invitation.professional?.name || 'Profissional não encontrado'}
                          </div>
                        </TableCell>
                        <TableCell>{invitation.clientName || 'Cliente não encontrado'}</TableCell>
                        <TableCell>{invitation.clientPhone}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            {invitation.appointmentDate ? 
                              `${formatDate(invitation.appointmentDate)} ${invitation.appointmentTime ? `às ${formatTime(invitation.appointmentTime)}` : ''}` : 
                              'Data não disponível'
                            }
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(invitation)}</TableCell>
                        <TableCell>{formatDate(invitation.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const reviewUrl = `${window.location.origin}/review/${invitation.invitationToken}`;
                                navigator.clipboard.writeText(reviewUrl);
                                toast({
                                  title: "Link copiado!",
                                  description: "O link da avaliação foi copiado para a área de transferência.",
                                });
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              Ver Link
                            </Button>
                            {!invitation.reviewSubmittedAt && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => sendInvitationMutation.mutate(invitation.appointmentId)}
                                disabled={sendInvitationMutation.isPending}
                              >
                                <Send className="h-4 w-4" />
                                Reenviar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <FloatingHelpButton menuLocation="reviews" />
    </div>
  );
}