import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Star, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ReviewData {
  invitation: {
    id: number;
    appointmentId: number;
    professionalId: number;
    clientPhone: string;
    invitationToken: string;
    reviewSubmittedAt: string | null;
    status: string;
  };
  professional: {
    id: number;
    name: string;
    specialties: string[] | null;
  };
  appointment: {
    id: number;
    clientName: string;
    appointmentDate: string;
    appointmentTime: string;
  };
}

export default function PublicReview() {
  const { token } = useParams();
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [hoveredStar, setHoveredStar] = useState(0);

  useEffect(() => {
    if (token) {
      fetchReviewData();
    }
  }, [token]);

  const fetchReviewData = async () => {
    try {
      const response = await fetch(`/api/public/review/${token}`);
      const data = await response.json();

      if (response.ok) {
        setReviewData(data);
        if (data.invitation.reviewSubmittedAt) {
          setSubmitted(true);
        }
      } else {
        setError(data.message || 'Convite de avaliação não encontrado');
      }
    } catch (error) {
      setError('Erro ao carregar dados da avaliação');
    } finally {
      setLoading(false);
    }
  };

  const submitReview = async () => {
    if (rating === 0) {
      setError('Por favor, selecione uma avaliação de 1 a 5 estrelas');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/public/review/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitted(true);
      } else {
        setError(data.message || 'Erro ao enviar avaliação');
      }
    } catch (error) {
      setError('Erro ao enviar avaliação');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const getRatingText = (stars: number) => {
    const texts = {
      1: 'Muito Insatisfeito',
      2: 'Insatisfeito',
      3: 'Regular',
      4: 'Satisfeito',
      5: 'Muito Satisfeito'
    };
    return texts[stars as keyof typeof texts] || '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Carregando...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !reviewData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Ops! Algo deu errado
              </h2>
              <p className="text-gray-600">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Avaliação Enviada!
              </h2>
              <p className="text-gray-600 mb-4">
                Obrigado pelo seu feedback! Sua opinião é muito importante para nós.
              </p>
              <div className="flex justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="h-6 w-6 text-yellow-400 fill-current"
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Avalie nosso Atendimento
          </CardTitle>
          <CardDescription>
            Sua opinião é muito importante para nós
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {reviewData && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div>
                <span className="font-medium text-gray-700">Profissional: </span>
                <span className="text-gray-900">{reviewData.professional.name}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Cliente: </span>
                <span className="text-gray-900">{reviewData.appointment.clientName}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Data do Atendimento: </span>
                <span className="text-gray-900">
                  {formatDate(reviewData.appointment.appointmentDate)} às {reviewData.appointment.appointmentTime}
                </span>
              </div>
              {reviewData.professional.specialties && reviewData.professional.specialties.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700">Especialidades: </span>
                  <span className="text-gray-900">
                    {reviewData.professional.specialties.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Como você avalia nosso atendimento?
              </label>
              <div className="flex justify-center space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= (hoveredStar || rating)
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {(hoveredStar || rating) > 0 && (
                <p className="text-center text-sm text-gray-600 mt-2">
                  {getRatingText(hoveredStar || rating)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comentários (opcional)
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte-nos sobre sua experiência..."
                rows={4}
                className="w-full"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                onClick={submitReview}
                disabled={submitting || rating === 0}
                className="flex-1"
              >
                {submitting ? 'Enviando...' : 'Enviar Avaliação'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}