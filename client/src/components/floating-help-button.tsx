import { HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FloatingHelpButtonProps {
  menuLocation: string;
}

export function FloatingHelpButton({ menuLocation }: FloatingHelpButtonProps) {
  const [showVideoModal, setShowVideoModal] = useState(false);

  // Fetch training video for the specific menu location
  const { data: trainingVideo } = useQuery({
    queryKey: ['/api/training-videos/by-menu', menuLocation],
    queryFn: async () => {
      const res = await fetch(`/api/training-videos/by-menu/${menuLocation}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Erro ao buscar vídeo de treinamento');
      }
      return res.json();
    },
  });

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^"&?\/\s]{11})/);
    return match ? match[1] : null;
  };

  // Only render if there's a video available
  if (!trainingVideo) {
    return null;
  }

  return (
    <>
      {/* Floating Help Button */}
      <button
        onClick={() => setShowVideoModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50"
        aria-label="Ajuda"
        title={trainingVideo.name}
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Video Modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{trainingVideo?.name || 'Vídeo de Treinamento'}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {trainingVideo?.description && (
              <p className="text-sm text-gray-600 mb-4">{trainingVideo.description}</p>
            )}
            {trainingVideo?.youtubeUrl && (
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute top-0 left-0 w-full h-full rounded-lg"
                  src={`https://www.youtube.com/embed/${getYouTubeVideoId(trainingVideo.youtubeUrl)}`}
                  title={trainingVideo.name}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
