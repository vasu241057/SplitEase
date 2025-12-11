import { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Send, Loader2 } from "lucide-react"
import { api } from "../utils/api"
import { useData } from "../context/DataContext"
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
          <div className="flex-1 flex items-center justify-center min-h-[200px] bg-muted/5 rounded-lg">
             <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
      )
  }

  const { currentUser } = useData()

  // ... (useQuery hooks) ...

  return (
    <div className={cn("flex flex-col flex-1 min-h-0 w-full", className)}>
        <div className="px-4 py-2 border-b bg-muted/30 flex-none">
            <h3 className="font-semibold text-sm">Activity & Comments</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
            {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                    <p>No activity yet.</p>
                </div>
            ) : (
                comments.map((comment: Comment) => {
                    const isMe = comment.user_id === currentUser.id
                    
                    if (comment.is_system) {
                        return (
                            <div key={comment.id} className="flex justify-center my-4">
                               <div className="text-center space-y-1">
                                   <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full inline-block border">
                                      <span className="font-medium text-foreground mr-1">{comment.author.name}</span>
                                      {comment.content}
                                   </p>
                                   <p className="text-[10px] text-muted-foreground">
                                       {formatTime(comment.created_at)}
                                   </p>
                               </div>
                            </div>
                        )
                    }

                    return (
                        <div key={comment.id} className={cn("flex gap-3 max-w-[85%]", isMe ? "ml-auto flex-row-reverse" : "mr-auto")}>
                             <Avatar className="h-8 w-8 mt-auto flex-shrink-0">
                                <AvatarImage src={comment.author.avatar} />
                                <AvatarFallback>{comment.author.name[0]}</AvatarFallback>
                             </Avatar>
                             
                             <div className={cn("flex flex-col space-y-1 min-w-0", isMe ? "items-end" : "items-start")}>
                                 {!isMe && <span className="text-xs font-semibold px-1">{comment.author.name}</span>}
                                 
                                 <div className={cn(
                                     "p-3 rounded-2xl text-sm break-words shadow-sm",
                                     isMe 
                                       ? "bg-primary text-primary-foreground rounded-br-none" 
                                       : "bg-muted text-foreground rounded-bl-none"
                                 )}>
                                     {comment.content}
                                 </div>
                                 <span className="text-[10px] text-muted-foreground px-1">
                                     {formatTime(comment.created_at)}
                                 </span>
                             </div>
                        </div>
                    )
                })
            )}
        </div>

        <div className="p-3 border-t bg-background flex-none">
             <div className="flex gap-2 items-center bg-muted/30 p-1.5 rounded-full border focus-within:ring-2 ring-primary/20 transition-all">
                <Input 
                   placeholder="Type a message..." 
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   className="flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 h-10 px-4 placeholder:text-muted-foreground/50"
                />
                <Button 
                    type="button" 
                    size="icon" 
                    onClick={(e) => { e.preventDefault(); handleSubmit(e as any) }}
                    disabled={addCommentMutation.isPending || !content.trim()}
                    className="h-9 w-9 rounded-full shrink-0"
                >
                    {addCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    </div>
  )
}
