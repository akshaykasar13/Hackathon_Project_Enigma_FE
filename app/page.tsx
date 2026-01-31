'use client'

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Send, MessageSquare, Database, Activity, Edit2, X } from 'lucide-react'

interface AgentEvent {
  agent: string
  message: string
  timestamp: string
  data?: any
}

interface Memory {
  id: number
  incident: string
  outcome: string
  timestamp: string
  metadata?: any
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  result?: any
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ''

export default function Home() {
  const [ticket, setTicket] = useState('')
  const [conversation, setConversation] = useState<ChatMessage[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [result, setResult] = useState<any>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'monitoring'>('chat')
  const [isProcessing, setIsProcessing] = useState(false)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [editIncident, setEditIncident] = useState('')
  const [editOutcome, setEditOutcome] = useState('')
  const eventsEndRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    try {
      const response = await axios.get('/api/memory/episodic?limit=20')
      setMemories(response.data)
    } catch (error) {
      console.error('Failed to load memories:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticket.trim() || isProcessing) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: ticket.trim(),
      timestamp: new Date().toISOString(),
    }
    setConversation(prev => [...prev, userMessage])
    setTicket('')
    setIsProcessing(true)
    setEvents([])
    setResult(null)

    const conversationHistory = conversation.map(m => ({ role: m.role, content: m.content }))

    let eventSource: EventSource | null = null
    const sseUrl = API_BASE ? `${API_BASE}/sse/agent-stream` : 'http://localhost:8000/sse/agent-stream'
    try {
      eventSource = new EventSource(sseUrl)
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const agentName = data.agent_name || 'System'
          const message = data.decision || data.tool_name || data.action || data.reasoning || `${agentName} executed`
          if (agentName && message) {
            setEvents(prev => {
              const eventKey = `${data.timestamp}-${agentName}-${message.substring(0, 50)}`
              const exists = prev.some(e => `${e.timestamp}-${e.agent}-${e.message.substring(0, 50)}` === eventKey)
              if (exists) return prev
              return [...prev, {
                agent: agentName,
                message,
                timestamp: data.timestamp || new Date().toISOString(),
                data,
              }]
            })
          }
        } catch (err) {
          console.error('Error parsing SSE:', err)
        }
      }
      eventSource.onerror = () => {
        eventSource?.close()
        eventSource = null
        simulateAgentEvents()
      }
    } catch (err) {
      simulateAgentEvents()
    }

    try {
      const response = await axios.post('/api/ticket', {
        ticket: userMessage.content,
        conversation_history: conversationHistory,
      })
      setResult(response.data)

      const trace = response.data?.execution_trace ?? response.data?.agent_events ?? response.data?.trace ?? []
      const rawTrace = Array.isArray(trace) ? trace : (trace?.steps ? trace.steps : [])
      if (rawTrace.length > 0) {
        const traceEvents: AgentEvent[] = rawTrace.map((step: any) => ({
          agent: step.agent ?? step.agent_name ?? step.agent_id ?? 'System',
          message: String(step.message ?? step.status ?? step.decision ?? step.action ?? step.reasoning ?? step.output ?? 'Completed'),
          timestamp: step.timestamp ?? new Date().toISOString(),
          data: step,
        }))
        setEvents(traceEvents)
      } else {
        setEvents(prev => [...prev, {
          agent: 'System',
          message: 'Processing complete',
          timestamp: new Date().toISOString(),
          data: response.data,
        }])
      }

      const assistantContent = response.data?.response || response.data?.message || JSON.stringify(response.data)
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.data?.error ? `Error: ${response.data?.message}` : assistantContent,
        timestamp: new Date().toISOString(),
        result: response.data,
      }
      setConversation(prev => [...prev, assistantMessage])
      loadMemories()
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || error.message || 'Failed to process ticket'
      setEvents(prev => [...prev, {
        agent: 'Error',
        message: errMsg,
        timestamp: new Date().toISOString(),
      }])
      setResult({ error: true, message: errMsg })
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errMsg}`,
        timestamp: new Date().toISOString(),
        result: { error: true },
      }])
    } finally {
      eventSource?.close()
      setIsProcessing(false)
    }
  }

  const simulateAgentEvents = () => {
    const agentFlow = [
      { agent: 'IngestionAgent', message: 'Processing input...' },
      { agent: 'PlannerAgent', message: 'Planning execution strategy...' },
      { agent: 'IntentAgent', message: 'Classifying intent...' },
      { agent: 'MemoryAgent', message: 'Loading memory...' },
      { agent: 'RetrievalAgent', message: 'Retrieving relevant documents...' },
      { agent: 'ReasoningAgent', message: 'Correlating with past incidents...' },
      { agent: 'ResponseAgent', message: 'Generating response...' },
      { agent: 'GuardrailsAgent', message: 'Applying safety checks...' },
    ]
    agentFlow.forEach((event, i) => {
      setTimeout(() => {
        setEvents(prev => [...prev, { ...event, timestamp: new Date().toISOString() }])
      }, i * 500)
    })
  }

  const deleteMemory = async (id: number) => {
    try {
      await axios.delete(`/api/memory/episodic/${id}`)
      loadMemories()
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
  }

  const openEditMemory = (memory: Memory) => {
    setEditingMemory(memory)
    setEditIncident(memory.incident)
    setEditOutcome(memory.outcome)
  }

  const closeEditMemory = () => {
    setEditingMemory(null)
    setEditIncident('')
    setEditOutcome('')
  }

  const saveMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMemory) return
    try {
      await axios.patch(`/api/memory/episodic/${editingMemory.id}`, {
        incident: editIncident,
        outcome: editOutcome,
      })
      loadMemories()
      closeEditMemory()
    } catch (error) {
      console.error('Failed to update memory:', error)
    }
  }

  const clearConversation = () => {
    setConversation([])
    setEvents([])
    setResult(null)
  }

  const renderToolUsage = (data: any) => {
    const toolName = data.tool_name ?? data.tool ?? data.function_name
    const input = data.input ?? data.args ?? data.parameters
    const output = data.output ?? data.result ?? data.response
    if (!toolName && !input && !output) return null
    return (
      <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm space-y-2">
        {toolName && (
          <div>
            <span className="font-semibold text-slate-600">Tool:</span>{' '}
            <code className="bg-slate-200 px-1 rounded">{String(toolName)}</code>
          </div>
        )}
        {input != null && (typeof input !== 'object' || Object.keys(input).length > 0) && (
          <div>
            <span className="font-semibold text-slate-600">Input:</span>
            <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-24">
              {typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input)}
            </pre>
          </div>
        )}
        {output != null && (
          <div>
            <span className="font-semibold text-slate-600">Output:</span>
            <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
              {typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8 text-center text-gray-800">
          🤖 Collaborative Agent System
        </h1>

        <div className="flex gap-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 font-semibold flex items-center ${
              activeTab === 'chat' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
            }`}
          >
            <MessageSquare className="mr-2" size={18} />
            Chat & Agents
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`px-4 py-2 font-semibold flex items-center ${
              activeTab === 'memory' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
            }`}
          >
            <Database className="mr-2" size={18} />
            Memory Management
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`px-4 py-2 font-semibold flex items-center ${
              activeTab === 'monitoring' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
            }`}
          >
            <Activity className="mr-2" size={18} />
            Monitoring
          </button>
        </div>

        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Conversation</h2>
                  {conversation.length > 0 && (
                    <button
                      onClick={clearConversation}
                      className="text-sm text-gray-500 hover:text-red-600"
                    >
                      Clear chat
                    </button>
                  )}
                </div>
                <div className="h-48 overflow-y-auto mb-4 border rounded-lg p-3 bg-gray-50 space-y-3">
                  {conversation.length === 0 && !isProcessing && (
                    <p className="text-gray-500 text-sm">No messages yet. Start a conversation below.</p>
                  )}
                  {conversation.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-100 ml-4 border-l-2 border-blue-400'
                          : 'bg-green-50 mr-4 border-l-2 border-green-400'
                      }`}
                    >
                      <span className="font-semibold text-xs text-gray-600">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
                      <p className="mt-0.5 break-words">{msg.content}</p>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex items-center text-gray-500 text-sm">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2" />
                      Thinking...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSubmit}>
                  <textarea
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    placeholder="Enter your ticket or follow-up..."
                    className="w-full h-24 p-3 border rounded-lg mb-4 resize-none"
                    disabled={isProcessing}
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !ticket.trim()}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Send className="mr-2" size={18} />
                    {isProcessing ? 'Processing...' : 'Send'}
                  </button>
                </form>
              </div>

              {result && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Result</h2>
                  {result.error ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded">
                      <p className="text-red-800"><strong>Error:</strong> {result.message}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {result.priority && (
                        <p><strong>Priority:</strong>{' '}
                          <span className={`px-2 py-1 rounded ${result.priority === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {result.priority}
                          </span>
                        </p>
                      )}
                      {result.action && (
                        <p><strong>Action:</strong>{' '}
                          <span className={`px-2 py-1 rounded ${result.action === 'ESCALATE' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                            {result.action}
                          </span>
                        </p>
                      )}
                      {result.confidence != null && (
                        <p><strong>Confidence:</strong> {(result.confidence * 100).toFixed(1)}%</p>
                      )}
                      {result.response && (
                        <div className="mt-4">
                          <strong>Response:</strong>
                          <p className="mt-2 p-3 bg-gray-50 rounded">{result.response}</p>
                        </div>
                      )}
                      {!result.priority && !result.action && !result.response && (
                        <div className="mt-4">
                          <strong>Full Response:</strong>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-64">
                            {JSON.stringify(result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Live Agent Stream</h2>
                <div className="h-[600px] overflow-y-auto">
                  {events.length === 0 && !isProcessing && (
                    <p className="text-gray-500 text-center py-8">No events yet. Send a message to see agent activity.</p>
                  )}
                  {events.map((event, idx) => (
                    <div
                      key={idx}
                      className={`agent-card ${(event.agent.toLowerCase().replace(/agent$/i, '').trim() || 'system')}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-gray-800">{event.agent}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-gray-700">{event.message}</p>
                      {event.data && renderToolUsage(event.data)}
                      {event.data && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-blue-600">View raw details</summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto">
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="streaming-line flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2" />
                      <span className="text-gray-600">Processing...</span>
                    </div>
                  )}
                  <div ref={eventsEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Episodic Memory</h2>
              <button
                onClick={loadMemories}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-4">
              {memories.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No memories yet.</p>
              ) : (
                memories.map((memory) => (
                  <div key={memory.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 mb-2">{memory.incident}</p>
                        <p className="text-gray-600 text-sm mb-2">{memory.outcome}</p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {memory.metadata?.priority && (
                            <span className={`px-2 py-1 rounded text-xs ${memory.metadata.priority === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                              {memory.metadata.priority}
                            </span>
                          )}
                          {memory.metadata?.confidence != null && (
                            <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                              Confidence: {(memory.metadata.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(memory.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => openEditMemory(memory)}
                          className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm flex items-center"
                        >
                          <Edit2 size={14} className="mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => deleteMemory(memory.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'monitoring' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">System Monitoring</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800">Total Events</h3>
                <p className="text-3xl font-bold text-blue-600">{events.length}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-green-800">Memories</h3>
                <p className="text-3xl font-bold text-green-600">{memories.length}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold text-purple-800">Status</h3>
                <p className="text-lg font-bold text-purple-600">
                  {isProcessing ? 'Processing' : 'Ready'}
                </p>
              </div>
              <div className="md:col-span-3 bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-800">Conversation Turns</h3>
                <p className="text-2xl font-bold text-slate-600">{conversation.length}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingMemory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit Memory</h3>
              <button onClick={closeEditMemory} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveMemory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Incident</label>
                <textarea
                  value={editIncident}
                  onChange={(e) => setEditIncident(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outcome</label>
                <textarea
                  value={editOutcome}
                  onChange={(e) => setEditOutcome(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                  rows={3}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditMemory}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
