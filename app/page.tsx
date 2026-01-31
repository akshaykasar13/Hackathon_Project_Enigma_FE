'use client'

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Send, MessageSquare, Database, Settings, Activity } from 'lucide-react'

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

export default function Home() {
  const [ticket, setTicket] = useState('')
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [result, setResult] = useState<any>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'monitoring'>('chat')
  const [isProcessing, setIsProcessing] = useState(false)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

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

    setIsProcessing(true)
    setEvents([])
    setResult(null)

    // Try to connect to SSE for real-time events
    let eventSource: EventSource | null = null
    try {
      eventSource = new EventSource('http://localhost:8000/sse/agent-stream')
      
      eventSource.onmessage = (event) => {
        try {
          // SSE sends: {"event": "agent_event", "data": "JSON_STRING"}
          // So we need to parse event.data which is already a JSON string
          const data = JSON.parse(event.data)
          
          // Extract agent name and message
          const agentName = data.agent_name || 'System'
          const message = data.decision || data.tool_name || data.action || data.reasoning || `${agentName} executed`
          
          // Only add if we have meaningful data (not just System)
          if (agentName && message) {
            setEvents(prev => {
              // Avoid duplicates by checking timestamp + agent + message
              const eventKey = `${data.timestamp}-${agentName}-${message.substring(0, 50)}`
              const exists = prev.some(e => {
                const eKey = `${e.timestamp}-${e.agent}-${e.message.substring(0, 50)}`
                return eKey === eventKey
              })
              if (exists) return prev
              
              console.log('Adding agent event:', agentName, message)
              return [...prev, {
                agent: agentName,
                message: message,
                timestamp: data.timestamp || new Date().toISOString(),
                data: data
              }]
            })
          }
        } catch (err) {
          console.error('Error parsing SSE event:', err, 'Raw data:', event.data)
        }
      }
      
      eventSource.onerror = (error) => {
        console.warn('SSE connection error, falling back to simulated events:', error)
        eventSource?.close()
        eventSource = null
        // Fall back to simulated events
        simulateAgentEvents()
      }
    } catch (err) {
      console.warn('SSE not available, using simulated events:', err)
      simulateAgentEvents()
    }

    // Submit ticket
    try {
      console.log('Submitting ticket:', ticket)
      const response = await axios.post('/api/ticket', { ticket })
      console.log('API Response:', response.data)
      setResult(response.data)

      // Display execution_trace or agent_events from the response (source of truth)
      const trace = response.data?.execution_trace ?? response.data?.agent_events ?? response.data?.trace ?? []
      const rawTrace = Array.isArray(trace) ? trace : (trace?.steps ? trace.steps : [])
      if (rawTrace.length > 0) {
        const traceEvents: AgentEvent[] = rawTrace.map((step: any) => {
          const agent = step.agent ?? step.agent_name ?? step.agent_id ?? 'System'
          const message = step.message ?? step.status ?? step.decision ?? step.action ?? step.reasoning ?? step.output ?? 'Completed'
          return {
            agent,
            message: String(message),
            timestamp: step.timestamp ?? new Date().toISOString(),
            data: step,
          }
        })
        // Replace with trace - it's the authoritative backend data (overrides any SSE/simulated events)
        setEvents(traceEvents)
      } else {
        // Fallback: add single completion event if no trace
        setEvents(prev => [...prev, {
          agent: 'System',
          message: 'Processing complete',
          timestamp: new Date().toISOString(),
          data: response.data,
        }])
      }

      // Reload memories
      loadMemories()
    } catch (error: any) {
      console.error('API Error:', error)
      console.error('Error details:', error.response?.data)
      setEvents(prev => [...prev, {
        agent: 'Error',
        message: error.response?.data?.detail || error.message || 'Failed to process ticket',
        timestamp: new Date().toISOString()
      }])
      setResult({
        error: true,
        message: error.response?.data?.detail || error.message || 'Failed to process ticket'
      })
    } finally {
      // Close SSE connection
      if (eventSource) {
        eventSource.close()
      }
      setIsProcessing(false)
    }
  }

  const simulateAgentEvents = () => {
    // Fallback: Simulate live streaming of agent events
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

    // Stream agent events
    agentFlow.forEach((event, i) => {
      setTimeout(() => {
        setEvents(prev => [...prev, {
          ...event,
          timestamp: new Date().toISOString()
        }])
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8 text-center text-gray-800">
          🤖 Collaborative Agent System
        </h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'chat' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
            }`}
          >
            <MessageSquare className="inline mr-2" size={18} />
            Chat & Agents
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'memory' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
            }`}
          >
            <Database className="inline mr-2" size={18} />
            Memory Management
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'monitoring' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
            }`}
          >
            <Activity className="inline mr-2" size={18} />
            Monitoring
          </button>
        </div>

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Section */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Submit Ticket</h2>
                <form onSubmit={handleSubmit}>
                  <textarea
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    placeholder="Enter your ticket or query..."
                    className="w-full h-32 p-3 border rounded-lg mb-4 resize-none"
                    disabled={isProcessing}
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !ticket.trim()}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Send className="mr-2" size={18} />
                    {isProcessing ? 'Processing...' : 'Submit Ticket'}
                  </button>
                </form>
              </div>

              {/* Result Section */}
              {result && (
                <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                  <h2 className="text-xl font-semibold mb-4">Result</h2>
                  {result.error ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded">
                      <p className="text-red-800"><strong>Error:</strong> {result.message}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {result.priority && (
                        <p><strong>Priority:</strong> <span className={`px-2 py-1 rounded ${result.priority === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{result.priority}</span></p>
                      )}
                      {result.action && (
                        <p><strong>Action:</strong> <span className={`px-2 py-1 rounded ${result.action === 'ESCALATE' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{result.action}</span></p>
                      )}
                      {result.confidence && <p><strong>Confidence:</strong> {(result.confidence * 100).toFixed(1)}%</p>}
                      {result.response && (
                        <div className="mt-4">
                          <strong>Response:</strong>
                          <p className="mt-2 p-3 bg-gray-50 rounded">{result.response}</p>
                        </div>
                      )}
                      {!result.priority && !result.action && !result.response && (
                        <div className="mt-4">
                          <strong>Full Response:</strong>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-64">{JSON.stringify(result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Agent Events Stream */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Live Agent Stream</h2>
                <div className="h-[600px] overflow-y-auto">
                  {events.length === 0 && !isProcessing && (
                    <p className="text-gray-500 text-center py-8">No events yet. Submit a ticket to see agent activity.</p>
                  )}
                  {events.map((event, idx) => (
                    <div key={idx} className={`agent-card ${event.agent.toLowerCase().replace('agent', '').trim()}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-gray-800">{event.agent}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-gray-700">{event.message}</p>
                      {event.data && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-blue-600">View details</summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto">
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="streaming-line">
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        <span className="text-gray-600">Processing...</span>
                      </div>
                    </div>
                  )}
                  <div ref={eventsEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Memory Management Tab */}
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
                        <div className="flex gap-2 mt-2">
                          {memory.metadata?.priority && (
                            <span className={`px-2 py-1 rounded text-xs ${memory.metadata.priority === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                              {memory.metadata.priority}
                            </span>
                          )}
                          {memory.metadata?.confidence && (
                            <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                              Confidence: {(memory.metadata.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(memory.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteMemory(memory.id)}
                        className="ml-4 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Monitoring Tab */}
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

