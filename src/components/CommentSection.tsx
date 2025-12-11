import { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Send, Loader2 } from "lucide-react"
import { api } from "../utils/api"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { cn } from "../utils/cn"

interface Comment {
  id: string
  content: string
  is_system: boolean
  created_at: string
  author: {
    name: string
    avatar?: string
  }
  user_id: string
}

interface CommentSectionProps {
  entityType: 'expense' | 'payment'
  entityId: string
  className?: string
}

export function CommentSection({ entityType, entityId, className }: CommentSectionProps) {
  const [content, setContent] = useState("")
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () => api.get(`/api/comments/${entityType}/${entityId}`).then(res => res || [])
  })

  // Auto scroll to bottom on new comments
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [comments])

  const addCommentMutation = useMutation({
    mutationFn: (text: string) => api.post(`/api/comments/${entityType}/${entityId}`, { content: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] })
      setContent("")
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
     e.preventDefault()
     if (!content.trim()) return
     addCommentMutation.mutate(content)
  }

  const formatTime = (isoString: string) => {
     return new Date(isoString).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
     })
  }

  if (isLoading) {
      return (
          <div className="h-[300px] flex items-center justify-center bg-muted/20 rounded-lg">
             <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
      )
  }

  return (
    <div className={cn("flex flex-col h-[400px] bg-card border rounded-xl overflow-hidden", className)}>
        <div className="p-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm">Activity & Comments</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
            {comments.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No activity yet.</p>
            ) : (
                comments.map((comment: Comment) => (
                    <div key={comment.id} className={cn("flex gap-3", comment.is_system ? "justify-center" : "")}>
                       {comment.is_system ? (
                           <div className="text-center space-y-1 my-2">
                               <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full inline-block">
                                  <span className="font-medium text-foreground mr-1">{comment.author.name}</span>
                                  {comment.content}
                               </p>
                               <p className="text-[10px] text-muted-foreground">
                                   {formatTime(comment.created_at)}
                               </p>
                           </div>
                       ) : (
                           <>
                             <Avatar className="h-8 w-8 mt-1">
                                <AvatarImage src={comment.author.avatar} />
                                <AvatarFallback>{comment.author.name[0]}</AvatarFallback>
                             </Avatar>
                             <div className="flex-1 space-y-1">
                                 <div className="flex items-baseline justify-between gap-2">
                                     <span className="text-sm font-semibold">{comment.author.name}</span>
                                     <span className="text-[10px] text-muted-foreground">{formatTime(comment.created_at)}</span>
                                 </div>
                                 <div className="bg-muted/30 p-2.5 rounded-lg rounded-tl-none text-sm">
                                     {comment.content}
                                 </div>
                             </div>
                           </>
                       )}
                    </div>
                ))
            )}
        </div>

        <div className="p-3 border-t bg-background">
            <form onSubmit={handleSubmit} className="flex gap-2">
                <Input 
                   placeholder="Write a comment..." 
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   className="flex-1"
                />
                <Button type="submit" size="icon" disabled={addCommentMutation.isPending || !content.trim()}>
                    {addCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </form>
        </div>
    </div>
  )
}
