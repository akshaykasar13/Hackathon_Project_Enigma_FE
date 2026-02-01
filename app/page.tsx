'use client'

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Send, MessageSquare, Database, Activity, Edit2, X, Info, ChevronDown, ChevronUp, ArrowRight, Zap, AlertTriangle, Wrench, Eye, Copy, Check, Download, Clock, HelpCircle, BookOpen } from 'lucide-react'

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

const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'RAG', definition: 'Retrieval-Augmented Generation: the backend searches your documents/knowledge base and uses that context to generate the answer. Retrieval happens before generation.' },
  { term: 'Episodic Memory', definition: 'Past incidents, conversations, and outcomes stored by the system. Agents read from it to correlate with similar past cases.' },
  { term: 'Semantic Memory', definition: 'Stored documents, FAQs, runbooks—the knowledge base that RAG searches.' },
  { term: 'Guardrails', definition: 'Safety and policy checks. The Guardrails agent can block harmful content, say "I don\'t know," or escalate to a human when confidence is low.' },
  { term: 'Escalation', definition: 'When the backend sends the ticket to a human or ops team instead of auto-responding (e.g. low confidence or policy).' },
  { term: 'Planner', definition: 'The agent that decides the execution strategy: which agents run, in what order (serial/parallel).' },
  { term: 'Tool call', definition: 'An agent calling a function (e.g. search memory, retrieve documents). Input and output are logged so you see what the backend did.' },
  { term: 'Pipeline', definition: 'The sequence of agents: Ingest → Plan → Intent → Memory → Retrieve → Reason → Response → Guard. Each step is visible in the stream.' },
]

const SAMPLE_QUERIES = [
  { label: 'Support: Payment failure (EU)', text: 'Payment service failing intermittently for EU users' },
  { label: 'Support: Past error?', text: 'Have we seen this error code before?' },
  { label: 'Self-service: Dashboard', text: 'Why is my dashboard not loading?' },
]

const AGENT_PIPELINE: { name: string; short: string; description: string; color: string }[] = [
  { name: 'Ingestion', short: 'Ingest', description: 'Parses your ticket and prepares it for the pipeline.', color: 'blue' },
  { name: 'Planner', short: 'Plan', description: 'Decides the execution strategy and next steps.', color: 'violet' },
  { name: 'Intent', short: 'Intent', description: 'Classifies what you are asking for (e.g. question, request, escalation).', color: 'emerald' },
  { name: 'Memory', short: 'Memory', description: 'Loads relevant past incidents and outcomes from episodic memory.', color: 'amber' },
  { name: 'Retrieval', short: 'Retrieve', description: 'Fetches relevant documents and context (RAG).', color: 'orange' },
  { name: 'Reasoning', short: 'Reason', description: 'Correlates with past cases and derives conclusions.', color: 'pink' },
  { name: 'Response', short: 'Response', description: 'Generates the final answer or recommended action.', color: 'indigo' },
  { name: 'Guardrails', short: 'Guard', description: 'Applies safety and policy checks before returning.', color: 'rose' },
]

const STEP_COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; ring: string; dot: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-500', ring: 'ring-blue-400', dot: 'bg-blue-500' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-500', ring: 'ring-violet-400', dot: 'bg-violet-500' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-500', ring: 'ring-emerald-400', dot: 'bg-emerald-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-500', ring: 'ring-amber-400', dot: 'bg-amber-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500', ring: 'ring-orange-400', dot: 'bg-orange-500' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-500', ring: 'ring-pink-400', dot: 'bg-pink-500' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-500', ring: 'ring-indigo-400', dot: 'bg-indigo-500' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-500', ring: 'ring-rose-400', dot: 'bg-rose-500' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-500', ring: 'ring-slate-400', dot: 'bg-slate-500' },
}

function agentNameToStepIndex(agentName: string): number {
  const lower = agentName.toLowerCase()
  const i = AGENT_PIPELINE.findIndex(({ name }) => lower.includes(name.toLowerCase()))
  return i >= 0 ? i : -1
}

function getStepColor(agentName: string): string {
  const i = agentNameToStepIndex(agentName)
  return i >= 0 ? AGENT_PIPELINE[i].color : 'slate'
}

function getAgentDescription(agentName: string): string {
  const i = agentNameToStepIndex(agentName)
  return i >= 0 ? AGENT_PIPELINE[i].description : 'Agent in the pipeline.'
}

export default function Home() {
  const [ticket, setTicket] = useState('')
  const [conversation, setConversation] = useState<ChatMessage[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [result, setResult] = useState<any>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'monitoring'>('chat')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [editIncident, setEditIncident] = useState('')
  const [editOutcome, setEditOutcome] = useState('')
  const eventsEndRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const eventRefs = useRef<(HTMLDivElement | null)[]>([])
  const [collapsedEvents, setCollapsedEvents] = useState<Set<number>>(new Set())
  const [showToolCallsSummary, setShowToolCallsSummary] = useState(true)
  const [showObservability, setShowObservability] = useState(true)
  const [copied, setCopied] = useState(false)
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'error' | null>(null)
  const [semanticMemories, setSemanticMemories] = useState<any[]>([])
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [showGlossary, setShowGlossary] = useState(false)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [showRunStory, setShowRunStory] = useState(true)
  const [showWhyResponse, setShowWhyResponse] = useState(true)
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  const [aiMetricsSummary, setAiMetricsSummary] = useState<any>(null)
  const [observabilityEvents, setObservabilityEvents] = useState<any[]>([])
  const [observabilityToolCalls, setObservabilityToolCalls] = useState<any[]>([])
  const [observabilityTrace, setObservabilityTrace] = useState<{ task_id: string; execution_trace?: any[]; agent_events?: any[] } | null>(null)
  const [observabilityLlmCalls, setObservabilityLlmCalls] = useState<any[]>([])
  const [observabilityLoading, setObservabilityLoading] = useState(false)
  const [observabilityLastUpdated, setObservabilityLastUpdated] = useState<Date | null>(null)
  const [monitoringSectionOpen, setMonitoringSectionOpen] = useState<Record<string, boolean>>({
    aiMetrics: true, executionTrace: true, events: true, toolCalls: true, llmCalls: true,
  })

  const completedPipelineSteps = events.length
    ? Array.from(
        new Set(events.map((e) => agentNameToStepIndex(e.agent)).filter((i) => i >= 0))
      ).sort((a, b) => a - b)
    : []

  const runDurationMs =
    events.length >= 2
      ? new Date(events[events.length - 1].timestamp).getTime() - new Date(events[0].timestamp).getTime()
      : 0

  const toolCallsThisRun = events.flatMap((e, idx) => {
    const d = e.data
    if (!d) return []
    const name = d.tool_name ?? d.tool ?? d.function_name
    if (!name && !d.input && !d.output) return []
    return [{ agent: e.agent, name: name || 'tool', input: d.input ?? d.args ?? d.parameters, output: d.output ?? d.result ?? d.response, eventIdx: idx }]
  })

  const agentsThatRan = events.length ? Array.from(new Set(events.map((e) => e.agent))) : []
  const isEscalated = result?.action === 'ESCALATE' || (result?.confidence != null && result.confidence < 0.5)
  const isGuardrailBlock = result?.action === 'BLOCK' || (typeof result?.response === 'string' && /don't know|cannot answer|blocked|escalat/i.test(result.response))

  const eventsPerAgent = events.length
    ? events.reduce<Record<string, number>>((acc, e) => {
        acc[e.agent] = (acc[e.agent] ?? 0) + 1
        return acc
      }, {})
    : {}

  const stepTiming = (() => {
    if (events.length < 2) return []
    const byStep = new Map<number, { first: number; last: number }>()
    events.forEach((e) => {
      const i = agentNameToStepIndex(e.agent)
      if (i < 0) return
      const t = new Date(e.timestamp).getTime()
      const cur = byStep.get(i)
      if (!cur) byStep.set(i, { first: t, last: t })
      else byStep.set(i, { first: Math.min(cur.first, t), last: Math.max(cur.last, t) })
    })
    return AGENT_PIPELINE.map((step, i) => {
      const range = byStep.get(i)
      if (!range) return { name: step.short, ms: 0 }
      return { name: step.short, ms: range.last - range.first }
    }).filter((x) => x.ms > 0)
  })()

  const lastEventForStatus = events.length > 0 ? events[events.length - 1] : null
  const runStory = (() => {
    const lines: string[] = ['Your message was sent to the backend.']
    const seen = new Set<string>()
    events.forEach((e) => {
      const step = AGENT_PIPELINE.find((s) => e.agent.toLowerCase().includes(s.name.toLowerCase()))
      const label = step ? step.name : e.agent
      if (!seen.has(label)) {
        seen.add(label)
        lines.push(`${label} agent: ${e.message}`)
      } else {
        lines.push(`  → ${e.message}`)
      }
    })
    if (result && !result.error) lines.push('Final response was returned to you.')
    return lines
  })()

  const runErrorsAndWarnings = events.reduce(
    (acc, e) => {
      if (e.agent === 'Error' || e.data?.error) acc.errors.push({ agent: e.agent, message: e.message, data: e.data?.error ?? e.data })
      if (e.data?.warning) acc.warnings.push({ agent: e.agent, message: e.message, data: e.data?.warning })
      return acc
    },
    { errors: [] as { agent: string; message: string; data?: any }[], warnings: [] as { agent: string; message: string; data?: any }[] }
  )

  const scrollToStep = (stepIndex: number) => {
    const eventIdx = events.findIndex((e) => agentNameToStepIndex(e.agent) === stepIndex)
    if (eventIdx >= 0 && eventRefs.current[eventIdx]) {
      eventRefs.current[eventIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const exportTrace = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      runDurationMs,
      eventsCount: events.length,
      toolCallsCount: toolCallsThisRun.length,
      outcome: result?.action ?? (result?.error ? 'error' : 'auto'),
      events,
      result,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyResponse = async () => {
    const text = result?.response ?? (result && JSON.stringify(result, null, 2))
    if (!text) return
    try {
      await navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const toggleEventCollapsed = (idx: number) => {
    setCollapsedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation])

  useEffect(() => {
    loadMemories()
    loadSemanticMemories()
  }, [])

  useEffect(() => {
    if (activeTab === 'memory') loadSemanticMemories()
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'monitoring') return
    setBackendStatus('checking')
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setBackendStatus(d?.ok ? 'ok' : 'error'))
      .catch(() => setBackendStatus('error'))
  }, [activeTab])

  const loadObservability = () => {
    if (backendStatus !== 'ok') return
    setObservabilityLoading(true)
    const base = '/api/observability'
    Promise.all([
      fetch(`${base}/ai-metrics/summary?days=7`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/events?limit=30`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/tool-calls`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/ai-metrics/llm-calls?limit=15`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([summary, eventsRes, toolCallsRes, llmCallsRes]) => {
        setAiMetricsSummary(summary && !summary.error ? summary : null)
        setObservabilityEvents(Array.isArray(eventsRes?.events) ? eventsRes.events : [])
        setObservabilityToolCalls(Array.isArray(toolCallsRes?.tool_calls) ? toolCallsRes.tool_calls : [])
        setObservabilityLlmCalls(Array.isArray(llmCallsRes?.llm_calls) ? llmCallsRes.llm_calls : [])
        setObservabilityLastUpdated(new Date())
      })
      .finally(() => setObservabilityLoading(false))
  }

  useEffect(() => {
    if (activeTab !== 'monitoring' || backendStatus !== 'ok') return
    loadObservability()
  }, [activeTab, backendStatus])

  useEffect(() => {
    if (activeTab !== 'monitoring' || backendStatus !== 'ok' || !lastTaskId) {
      if (!lastTaskId) setObservabilityTrace(null)
      return
    }
    fetch(`/api/ticket/${encodeURIComponent(lastTaskId)}/execution-trace`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => (d && !d.error ? setObservabilityTrace(d) : setObservabilityTrace(null)))
      .catch(() => setObservabilityTrace(null))
  }, [activeTab, backendStatus, lastTaskId])

  useEffect(() => {
    if (backendStatus !== null) return
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setBackendStatus(d?.ok ? 'ok' : 'error'))
      .catch(() => setBackendStatus('error'))
  }, [])

  const loadMemories = async () => {
    try {
      const response = await axios.get('/api/memory/episodic?limit=20')
      setMemories(response.data)
    } catch (error) {
      console.error('Failed to load memories:', error)
    }
  }

  const loadSemanticMemories = async () => {
    setSemanticLoading(true)
    try {
      const response = await axios.get('/api/memory/semantic')
      const data = response.data
      const list = Array.isArray(data) ? data : (data?.items ?? data?.memories ?? data?.results ?? (data && typeof data === 'object' && !Array.isArray(data) ? Object.values(data) : []))
      setSemanticMemories(Array.isArray(list) ? list : [])
    } catch (error) {
      console.error('Failed to load semantic memory:', error)
      setSemanticMemories([])
    } finally {
      setSemanticLoading(false)
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
    setCollapsedEvents(new Set())

    const conversationHistory = conversation.map(m => ({ role: m.role, content: m.content }))

    let eventSource: EventSource | null = null
    const sseUrl = API_BASE ? `${API_BASE}/sse/agent-stream` : 'http://15.206.213.150/sse/agent-stream'
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
      const taskId = response.data?.task_id
      if (taskId) setLastTaskId(taskId)

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
    if (typeof window !== 'undefined' && !window.confirm('Delete this memory? This cannot be undone.')) return
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
      <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200 border-l-4 border-l-orange-500 text-sm space-y-2">
        {toolName && (
          <div>
            <span className="font-semibold text-orange-800">Tool:</span>{' '}
            <code className="bg-orange-200 text-orange-900 px-1 rounded">{String(toolName)}</code>
          </div>
        )}
        {input != null && (typeof input !== 'object' || Object.keys(input).length > 0) && (
          <div>
            <span className="font-semibold text-orange-800">Input:</span>
            <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-24 border border-orange-200">
              {typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input)}
            </pre>
          </div>
        )}
        {output != null && (
          <div>
            <span className="font-semibold text-orange-800">Output:</span>
            <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32 border border-orange-200">
              {typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" role="main" id="main">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h1 className="text-4xl font-bold text-gray-800">
            🤖 Collaborative Agent System
          </h1>
          <button
            type="button"
            onClick={() => setShowGlossary((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium"
            aria-label="Glossary and help"
          >
            <HelpCircle size={18} />
            {showGlossary ? 'Hide glossary' : 'Glossary & help'}
          </button>
        </div>
        <p className="text-gray-600 mb-4 max-w-2xl">
          Everything the backend does is shown here: each agent, tool call, timing, and the final result. Use the stream, pipeline, and Result panel to see what happened.
        </p>

        {showGlossary && (
          <div className="mb-6 p-6 bg-white rounded-lg shadow border border-slate-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BookOpen size={20} />
              What do these terms mean?
            </h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {GLOSSARY.map(({ term, definition }) => {
                const colors: Record<string, string> = {
                  RAG: 'border-l-orange-500 bg-orange-50/50 border-orange-200',
                  'Episodic Memory': 'border-l-amber-500 bg-amber-50/50 border-amber-200',
                  'Semantic Memory': 'border-l-indigo-500 bg-indigo-50/50 border-indigo-200',
                  Guardrails: 'border-l-rose-500 bg-rose-50/50 border-rose-200',
                  Escalation: 'border-l-amber-500 bg-amber-50/50 border-amber-200',
                  Planner: 'border-l-violet-500 bg-violet-50/50 border-violet-200',
                  'Tool call': 'border-l-slate-500 bg-slate-50 border-slate-200',
                  Pipeline: 'border-l-blue-500 bg-blue-50/50 border-blue-200',
                }
                const style = colors[term] || 'border-l-slate-400 bg-slate-50 border-slate-200'
                return (
                  <div key={term} className={`p-3 rounded border border-l-4 ${style}`}>
                    <dt className="font-semibold text-slate-800 mb-1">{term}</dt>
                    <dd className="text-slate-600">{definition}</dd>
                  </div>
                )
              })}
            </dl>
          </div>
        )}

        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2.5 font-semibold flex items-center transition-colors duration-200 -mb-px ${
              activeTab === 'chat' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800 hover:border-b-2 hover:border-gray-300'
            }`}
          >
            <MessageSquare className="mr-2" size={18} />
            Chat & Agents
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`px-4 py-2.5 font-semibold flex items-center transition-colors duration-200 -mb-px ${
              activeTab === 'memory' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800 hover:border-b-2 hover:border-gray-300'
            }`}
          >
            <Database className="mr-2" size={18} />
            Memory Management
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monitoring')}
            className={`px-4 py-2.5 font-semibold flex items-center transition-colors duration-200 -mb-px ${
              activeTab === 'monitoring' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800 hover:border-b-2 hover:border-gray-300'
            }`}
          >
            <Activity className="mr-2" size={18} />
            Monitoring
          </button>
        </div>

        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-l-blue-400">
                <div className="mb-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Conversation</h2>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium" title="Short-term context the backend receives">{conversation.length} messages</span>
                      {conversation.length > 0 && (
                        <button
                          type="button"
                          onClick={clearConversation}
                          className="text-sm text-gray-500 hover:text-red-600"
                          aria-label="Clear conversation"
                        >
                          Clear chat
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Your messages and the assistant replies. This is the context sent to the backend with each request.</p>
                </div>
                <div className="h-48 overflow-y-auto mb-4 border rounded-lg p-3 bg-gray-50 space-y-3">
                  {conversation.length === 0 && !isProcessing && (
                    <div className="text-center py-4">
                      <p className="text-gray-500 text-sm">No messages yet.</p>
                      <p className="text-xs text-gray-400 mt-1">Type a ticket below and click Send to see agents work in real time.</p>
                    </div>
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
                    <div className="flex items-start gap-2 text-gray-500 text-sm p-2 rounded-lg bg-blue-50 border border-blue-200 border-l-4 border-l-blue-500">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-blue-800 font-medium">Backend is processing your message.</p>
                        {lastEventForStatus && (
                          <p className="text-xs text-blue-600 mt-1" title="Latest activity from the backend">
                            Right now: <strong>{lastEventForStatus.agent}</strong> — {lastEventForStatus.message}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSubmit}>
                  <p className="text-xs font-medium text-gray-600 mb-2">Try sample scenarios:</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {SAMPLE_QUERIES.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => setTicket(q.text)}
                        disabled={isProcessing}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${ticket === q.text ? 'bg-blue-100 border-blue-400 text-blue-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-blue-50 hover:border-blue-300'}`}
                        title={q.text}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        if (!isProcessing && ticket.trim()) handleSubmit(e as unknown as React.FormEvent)
                      }
                    }}
                    placeholder="Enter your ticket or follow-up... (Ctrl+Enter to send)"
                    className="w-full h-24 p-3 border rounded-lg mb-4 resize-none"
                    disabled={isProcessing}
                    aria-label="Ticket or message input"
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !ticket.trim()}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label={isProcessing ? 'Processing' : 'Send message'}
                  >
                    <Send className="mr-2" size={18} />
                    {isProcessing ? 'Processing...' : 'Send'}
                  </button>
                </form>
              </div>

              {result && (
                <div className={`bg-white rounded-lg shadow-lg p-6 border-l-4 ${result.error ? 'border-red-500' : result.action === 'ESCALATE' ? 'border-amber-500' : result.action === 'BLOCK' ? 'border-rose-500' : 'border-emerald-500'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h2 className="text-xl font-semibold text-gray-800">Result</h2>
                    <button
                      type="button"
                      onClick={copyResponse}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                      aria-label={copied ? 'Copied' : 'Copy result'}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied' : 'Copy result'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">What the backend returned. Hover over labels for explanations.</p>
                  {(isEscalated || isGuardrailBlock) && (
                    <div className={`mb-4 p-4 rounded-lg border flex items-start gap-3 ${result.action === 'ESCALATE' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                      <AlertTriangle size={20} className={`shrink-0 mt-0.5 ${result.action === 'ESCALATE' ? 'text-amber-600' : 'text-rose-600'}`} />
                      <div>
                        <p className={`font-semibold ${result.action === 'ESCALATE' ? 'text-amber-800' : 'text-rose-800'}`}>
                          {result.action === 'ESCALATE' ? 'Escalated to human / ops' : 'Guardrails applied'}
                        </p>
                        <p className={`text-sm mt-1 ${result.action === 'ESCALATE' ? 'text-amber-700' : 'text-rose-700'}`}>
                          {result.action === 'ESCALATE'
                            ? 'Confidence was below threshold or policy required human review.'
                            : 'This request was blocked or limited by safety or policy checks.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {result.error ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded">
                      <p className="text-red-800"><strong>Error:</strong> {result.message}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {result.priority && (
                        <p title="How urgent the backend classified this ticket (from Intent/Classification agent).">
                          <strong>Priority:</strong>{' '}
                          <span className={`px-2 py-1 rounded font-medium ${result.priority === 'HIGH' ? 'bg-red-100 text-red-800 border border-red-200' : result.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                            {result.priority}
                          </span>
                        </p>
                      )}
                      {result.action && (
                        <p title="Backend decision: auto-response (answer returned) or ESCALATE (sent to human/ops) or BLOCK (guardrails).">
                          <strong>Action:</strong>{' '}
                          <span className={`px-2 py-1 rounded font-medium ${result.action === 'ESCALATE' ? 'bg-amber-100 text-amber-800 border border-amber-200' : result.action === 'BLOCK' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                            {result.action}
                          </span>
                        </p>
                      )}
                      {result.confidence != null && (
                        <p title="Backend confidence in the response (low confidence can trigger escalation).">
                          <strong>Confidence:</strong>{' '}
                          <span className={`px-2 py-1 rounded font-medium ${result.confidence >= 0.7 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : result.confidence >= 0.4 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                            {(result.confidence * 100).toFixed(1)}%
                          </span>
                        </p>
                      )}
                      {result.response && (
                        <div className="mt-4 p-3 rounded-lg border-l-4 border-emerald-400 bg-emerald-50/50">
                          <strong className="text-emerald-800">Response</strong>
                          <p className="mt-2 p-3 bg-white rounded border border-emerald-100 text-gray-800">{result.response}</p>
                        </div>
                      )}
                      {(result.sources ?? result.retrieved_context ?? result.documents ?? result.context ?? result.rag_sources) && (
                        <div className="mt-4 p-3 bg-orange-50 rounded-lg border border-orange-200 border-l-4 border-l-orange-500">
                          <strong className="text-orange-800">Sources / Retrieved context (RAG)</strong>
                          <p className="text-xs text-orange-700 mt-1 mb-2">Context used to generate the response.</p>
                          <ul className="space-y-2 text-sm">
                            {(() => {
                              const raw = result.sources ?? result.retrieved_context ?? result.documents ?? result.context ?? result.rag_sources
                              const arr = Array.isArray(raw) ? raw : [raw]
                              return arr.slice(0, 10).map((s: any, i: number) => (
                                <li key={i} className="p-2 bg-white rounded border border-orange-200 text-slate-700">
                                  {typeof s === 'string' ? s : (s?.content ?? s?.text ?? s?.title ?? JSON.stringify(s))}
                                </li>
                              ))
                            })()}
                          </ul>
                        </div>
                      )}
                      {(result.plan ?? result.execution_plan ?? result.delegation_plan) && (
                        <div className="mt-4 p-3 bg-violet-50 rounded-lg border border-violet-200">
                          <strong className="text-violet-800">Execution plan (Planner)</strong>
                          <p className="text-xs text-violet-600 mt-1 mb-2">Steps decided by the Planner / Orchestrator.</p>
                          <pre className="text-sm text-violet-900 whitespace-pre-wrap p-2 bg-white rounded border border-violet-200">
                            {typeof (result.plan ?? result.execution_plan ?? result.delegation_plan) === 'string'
                              ? (result.plan ?? result.execution_plan ?? result.delegation_plan)
                              : JSON.stringify(result.plan ?? result.execution_plan ?? result.delegation_plan, null, 2)}
                          </pre>
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

                      {!result.error && runStory.length > 1 && (
                        <div className="mt-6 pt-4 border-t border-gray-100 border-l-4 border-l-blue-300 pl-3">
                          <button
                            type="button"
                            onClick={() => setShowRunStory((v) => !v)}
                            className="flex items-center gap-2 text-sm font-semibold text-blue-800 hover:text-blue-600"
                          >
                            What happened (step by step)
                            {showRunStory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          {showRunStory && (
                            <ol className="mt-2 space-y-1.5 text-sm text-gray-600 list-decimal list-inside">
                              {runStory.map((line, i) => (
                                <li key={i} className="pl-1 border-l-2 border-blue-100 border-l-blue-200">{line}</li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}

                      {!result.error && (agentsThatRan.length > 0 || result?.response) && (
                        <div className="mt-4 pt-4 border-t border-gray-100 border-l-4 border-l-indigo-300 pl-3">
                          <button
                            type="button"
                            onClick={() => setShowWhyResponse((v) => !v)}
                            className="flex items-center gap-2 text-sm font-semibold text-indigo-800 hover:text-indigo-600"
                          >
                            Why this response?
                            {showWhyResponse ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          {showWhyResponse && (
                            <div className="mt-2 text-sm text-gray-600 space-y-2">
                              <p>This response was produced by the backend pipeline:</p>
                              <ul className="space-y-1.5">
                                {(result?.sources ?? result?.retrieved_context ?? result?.documents) && (
                                  <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" /><span>Retrieved context (RAG) was used to ground the answer.</span></li>
                                )}
                                {agentsThatRan.some((a) => /memory/i.test(a)) && (
                                  <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" /><span>Past incidents from episodic memory were consulted.</span></li>
                                )}
                                {agentsThatRan.some((a) => /retrieval|retrieve/i.test(a)) && (
                                  <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" /><span>Documents from the knowledge base were searched.</span></li>
                                )}
                                {result?.action === 'ESCALATE' && (
                                  <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" /><span>It was escalated because confidence was below threshold or policy required human review.</span></li>
                                )}
                                {result?.action !== 'ESCALATE' && result?.action !== 'BLOCK' && (
                                  <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1.5" /><span>Guardrails passed; the backend returned an auto-response.</span></li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => setShowTechnicalDetails((v) => !v)}
                          className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
                        >
                          Technical details (what was sent &amp; received)
                          {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {showTechnicalDetails && (
                          <div className="mt-2 text-xs text-gray-600 space-y-2 p-3 bg-slate-50 rounded border border-slate-200">
                            <p><strong>Request to backend:</strong> ticket (your message) + conversation_history ({conversation.length} messages).</p>
                            <p><strong>Response from backend:</strong> {result ? Object.keys(result).filter((k) => !k.startsWith('_')).join(', ') : '—'}.</p>
                            {runDurationMs > 0 && <p><strong>Run duration:</strong> {(runDurationMs / 1000).toFixed(2)}s.</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!result.error && (agentsThatRan.length > 0 || toolCallsThisRun.length > 0) && (
                    <div className="mt-6 pt-4 border-t border-gray-100 border-l-4 border-l-slate-400 pl-3 space-y-4">
                      <button
                        type="button"
                        onClick={() => setShowObservability((v) => !v)}
                        className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-slate-600"
                      >
                        <Eye size={16} className="text-slate-600" />
                        Observability & explainability
                        {showObservability ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {showObservability && (
                        <div className="space-y-4 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={exportTrace}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium"
                              aria-label="Export trace as JSON"
                            >
                              <Download size={14} />
                              Export trace (JSON)
                            </button>
                            {runDurationMs > 0 && (
                              <span className="text-xs text-gray-500">Total run: {(runDurationMs / 1000).toFixed(2)}s</span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Agents that ran</p>
                            <p className="text-gray-600">{agentsThatRan.join(' → ')}</p>
                          </div>
                          {Object.keys(eventsPerAgent).length > 0 && (
                            <div>
                              <p className="font-medium text-gray-700 mb-1">Events per agent</p>
                              <p className="text-gray-600 text-xs flex flex-wrap gap-x-2 gap-y-1">
                                {Object.entries(eventsPerAgent).map(([agent, count]) => (
                                  <span key={agent} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                    {agent}: {count}
                                  </span>
                                ))}
                              </p>
                            </div>
                          )}
                          {stepTiming.length > 0 && (
                            <div>
                              <p className="font-medium text-gray-700 mb-1 flex items-center gap-1">
                                <Clock size={14} />
                                Step timing (per agent)
                              </p>
                              <p className="text-gray-600 text-xs flex flex-wrap gap-x-2 gap-y-1">
                                {stepTiming.map(({ name, ms }) => (
                                  <span key={name} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700" title={`${name}: ${ms}ms`}>
                                    {name}: {(ms / 1000).toFixed(2)}s
                                  </span>
                                ))}
                              </p>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <p className="font-medium text-gray-700 w-full mb-1">Capabilities used (requirements)</p>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${agentsThatRan.some((a) => /retrieval|retrieve/i.test(a)) ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`} title="RAG: retrieval before generation">RAG</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${agentsThatRan.some((a) => /memory/i.test(a)) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`} title="Memory: episodic/semantic">Memory</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${agentsThatRan.some((a) => /guardrail|guard/i.test(a)) ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500'}`} title="Guardrails & safety">Guardrails</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${agentsThatRan.some((a) => /planner|plan/i.test(a)) ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-500'}`} title="Planning & delegation">Planning</span>
                          </div>
                          {(runErrorsAndWarnings.errors.length > 0 || runErrorsAndWarnings.warnings.length > 0) && (
                            <div className="space-y-2">
                              {runErrorsAndWarnings.errors.length > 0 && (
                                <div>
                                  <p className="font-medium text-red-700 mb-1">Errors ({runErrorsAndWarnings.errors.length})</p>
                                  <ul className="text-xs text-red-700 space-y-1">
                                    {runErrorsAndWarnings.errors.slice(0, 5).map((err, i) => (
                                      <li key={i}>{err.agent}: {err.message}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {runErrorsAndWarnings.warnings.length > 0 && (
                                <div>
                                  <p className="font-medium text-amber-700 mb-1">Warnings ({runErrorsAndWarnings.warnings.length})</p>
                                  <ul className="text-xs text-amber-700 space-y-1">
                                    {runErrorsAndWarnings.warnings.slice(0, 5).map((w, i) => (
                                      <li key={i}>{w.agent}: {w.message}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Outcome</p>
                            <p className="text-gray-600">
                              {result?.action === 'ESCALATE' ? 'Escalated' : result?.action === 'BLOCK' ? 'Blocked by guardrails' : 'Auto-response'}
                              {result?.confidence != null && ` (confidence: ${(result.confidence * 100).toFixed(0)}%)`}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">
                            Decision trace: see <strong>Live Agent Stream</strong> for step-by-step execution and tool usage.
                          </p>
                        </div>
                      )}
                      <div className="border-l-4 border-l-orange-400 pl-3">
                        <button
                          type="button"
                          onClick={() => setShowToolCallsSummary((v) => !v)}
                          className="flex items-center gap-2 text-sm font-semibold text-orange-800 hover:text-orange-600"
                          title="Count is from agent event data (tool_name, input, output) in the stream"
                        >
                          <Wrench size={16} className="text-orange-600" />
                          Tool calls this run ({toolCallsThisRun.length})
                          {showToolCallsSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {showToolCallsSummary && (
                          toolCallsThisRun.length > 0 ? (
                            <ul className="space-y-2 text-xs mt-2">
                              {toolCallsThisRun.map((tc, i) => (
                                <li key={i} className="p-2 bg-orange-50 rounded border border-orange-200 border-l-4 border-l-orange-500">
                                  <span className="font-medium text-orange-800">{tc.agent}</span>
                                  {' → '}
                                  <code className="bg-slate-200 px-1 rounded">{String(tc.name)}</code>
                                  {tc.input != null && (
                                    <span className="text-slate-600 ml-1">
                                      (in: {typeof tc.input === 'object'
                                        ? (JSON.stringify(tc.input).length > 60 ? JSON.stringify(tc.input).slice(0, 60) + '…' : JSON.stringify(tc.input))
                                        : (String(tc.input).length > 40 ? String(tc.input).slice(0, 40) + '…' : String(tc.input))})
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-500 mt-2">No tool calls recorded for this run. Count comes from agent event data (tool_name, input, output) in the Live Agent Stream.</p>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-lg shadow-lg p-4 border-l-4 border-l-blue-400">
                <button
                  type="button"
                  onClick={() => setShowHowItWorks((v) => !v)}
                  className="w-full flex items-center justify-between text-left font-semibold text-blue-900 hover:text-blue-600"
                >
                  <span className="flex items-center gap-2">
                    <Info size={18} className="text-blue-600" />
                    How agents work
                  </span>
                  {showHowItWorks ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {showHowItWorks && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
                        <Zap size={14} />
                        What happens when you send?
                      </p>
                      <ol className="text-sm text-blue-900 space-y-1.5 list-decimal list-inside">
                        <li>Your message is sent to the backend.</li>
                        <li>The pipeline runs in order: Ingest → Plan → Intent → Memory → Retrieve → Reason → Response → Guard.</li>
                        <li>Each agent appears in the stream below as it runs; you can click pipeline steps to jump to that agent.</li>
                        <li>When done, the final response appears in the Result panel and in the conversation.</li>
                      </ol>
                    </div>
                    <p className="text-sm text-gray-600">
                      Your ticket is processed by a pipeline of specialized agents. Each agent has a role; they run in sequence and can use tools (e.g. memory, retrieval).
                    </p>
                    <p className="text-xs text-gray-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <strong>Execution model:</strong> Agents run <strong>serially</strong> when one step depends on another; some steps may run in <strong>parallel</strong> (e.g. Intent, Retrieval, Memory); memory and observability updates can be <strong>asynchronous</strong>.
                    </p>
                    <div className="flex flex-wrap gap-1 items-center justify-center text-xs">
                      {AGENT_PIPELINE.map((step, i) => {
                        const c = STEP_COLOR_CLASSES[step.color] || STEP_COLOR_CLASSES.blue
                        return (
                          <span key={step.name} className="flex items-center gap-1">
                            <span className={`px-2 py-1 rounded font-medium ${c.bg} ${c.text}`}>{step.short}</span>
                            {i < AGENT_PIPELINE.length - 1 && <span className="text-slate-400">→</span>}
                          </span>
                        )
                      })}
                    </div>
                    <p className="text-xs text-gray-500 font-medium">Color legend (same colors in pipeline &amp; stream below)</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {AGENT_PIPELINE.map((step) => {
                        const c = STEP_COLOR_CLASSES[step.color] || STEP_COLOR_CLASSES.blue
                        return (
                          <li key={step.name} className="flex gap-2 items-start">
                            <span className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${c.dot}`} />
                            <span><span className="font-medium text-gray-800">{step.name}:</span>{' '}<span className="text-gray-600">{step.description}</span></span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {(events.length > 0 || isProcessing) && (
                <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-600">Agent flow (click a step to scroll)</p>
                    {events.length > 0 && !isProcessing && runDurationMs > 0 && (
                      <span className="text-xs text-gray-500">Completed in ~{(runDurationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-0.5 flex-wrap">
                    {AGENT_PIPELINE.map((step, i) => {
                      const done = completedPipelineSteps.includes(i)
                      const current = isProcessing && completedPipelineSteps.length === i
                      const c = STEP_COLOR_CLASSES[step.color] || STEP_COLOR_CLASSES.blue
                      const hasEvent = events.some((e) => agentNameToStepIndex(e.agent) === i)
                      return (
                        <div key={step.name} className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => hasEvent && scrollToStep(i)}
                            disabled={!hasEvent}
                            title={step.description}
                            className={`flex flex-col items-center justify-center w-12 h-10 rounded-md border-2 text-[10px] font-bold transition-all duration-200 ${
                              current
                                ? `${c.bg} ${c.border} ${c.text} animate-pulse ring-2 ${c.ring}`
                                : done
                                  ? `${c.bg} ${c.border} ${c.text} ${hasEvent ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`
                                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'
                            }`}
                          >
                            {step.short}
                          </button>
                          {i < AGENT_PIPELINE.length - 1 && (
                            <ArrowRight size={12} className="text-slate-300 shrink-0 mx-0.5" aria-hidden />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-l-violet-400">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-violet-900">Live Agent Stream</h2>
                  <p className="text-xs text-violet-700 mt-1">Each card is one backend agent event. You see who ran, what they did, and any tool calls (input/output).</p>
                </div>
                {(events.length > 0 || isProcessing) && (
                  <div className="mb-4 flex flex-wrap gap-1.5 items-center justify-center text-xs">
                    <span className="text-gray-500 mr-1">Pipeline (click to scroll to agent):</span>
                    {AGENT_PIPELINE.map((step, i) => {
                      const done = completedPipelineSteps.includes(i)
                      const current = isProcessing && completedPipelineSteps.length === i
                      const c = STEP_COLOR_CLASSES[step.color] || STEP_COLOR_CLASSES.blue
                      const hasEvent = events.some((e) => agentNameToStepIndex(e.agent) === i)
                      return (
                        <button
                          key={step.name}
                          type="button"
                          onClick={() => hasEvent && scrollToStep(i)}
                          disabled={!hasEvent}
                          title={hasEvent ? `Scroll to ${step.name}: ${step.description}` : step.description}
                          className={`px-2.5 py-1 rounded font-medium transition-all duration-200 ${
                            current
                              ? `${c.bg} ${c.text} ring-2 ${c.ring} animate-pulse`
                              : done
                                ? `${c.bg} ${c.text} hover:opacity-90 ${hasEvent ? 'cursor-pointer' : 'cursor-default'}`
                                : 'bg-slate-100 text-slate-400 cursor-default'
                          }`}
                        >
                          {step.short}
                        </button>
                      )
                    })}
                    {events.length > 0 && !isProcessing && (
                      <span className="text-gray-400 ml-1">
                        ({completedPipelineSteps.length} of {AGENT_PIPELINE.length} ran
                        {runDurationMs > 0 && ` · ~${(runDurationMs / 1000).toFixed(1)}s`})
                      </span>
                    )}
                  </div>
                )}
                <div className="h-[520px] overflow-y-auto">
                  {events.length === 0 && !isProcessing && (
                    <div className="text-center py-10 px-4">
                      <p className="text-gray-500 mb-2">No events yet.</p>
                      <p className="text-sm text-gray-400">Enter a ticket below and click Send to see agents work in real time.</p>
                    </div>
                  )}
                  {events.map((event, idx) => {
                    const color = getStepColor(event.agent)
                    const c = STEP_COLOR_CLASSES[color] || STEP_COLOR_CLASSES.slate
                    const isCollapsed = collapsedEvents.has(idx)
                    return (
                      <div
                        key={idx}
                        ref={(el) => { eventRefs.current[idx] = el }}
                        className={`agent-card-in rounded-lg shadow-md p-4 mb-4 border-l-4 transition-all duration-200 ${c.bg} ${c.border} ${isCollapsed ? 'hover:shadow-lg' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleEventCollapsed(idx)}
                          className="w-full flex justify-between items-start text-left mb-2 cursor-pointer group"
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`font-semibold ${c.text}`}>{event.agent}</span>
                            {agentNameToStepIndex(event.agent) >= 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/70 text-gray-600 shrink-0">
                                Step {agentNameToStepIndex(event.agent) + 1} of {AGENT_PIPELINE.length}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-gray-500">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                            {isCollapsed ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
                          </span>
                        </button>
                        <p className="text-xs text-gray-500 mb-1" title={getAgentDescription(event.agent)}>
                          {getAgentDescription(event.agent)}
                        </p>
                        {!isCollapsed && (
                          <>
                            <p className="text-gray-700 mb-2">In this run: {event.message}</p>
                            {event.data && renderToolUsage(event.data)}
                            {event.data && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-700">View raw details</summary>
                                <pre className="mt-2 p-2 bg-white/60 rounded text-xs overflow-auto">
                                  {JSON.stringify(event.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </>
                        )}
                        {isCollapsed && (
                          <p className="text-gray-600 text-sm truncate" title={event.message}>{event.message}</p>
                        )}
                      </div>
                    )
                  })}
                  {isProcessing && (
                    <div className="streaming-line flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-800">Processing...</p>
                        {(events.length > 0 || completedPipelineSteps.length > 0) && (
                          <p className="text-xs text-blue-600 mt-0.5">
                            Step {Math.max(completedPipelineSteps.length, 1)} of {AGENT_PIPELINE.length} in pipeline
                          </p>
                        )}
                      </div>
                      <div className="w-24 h-1.5 bg-blue-200 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${(completedPipelineSteps.length / AGENT_PIPELINE.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div ref={eventsEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="bg-white rounded-lg shadow-lg p-6 space-y-8">
            <div className="border-l-4 border-l-amber-500 pl-6 -ml-2">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-amber-900">Episodic Memory</h2>
                <button
                  type="button"
                  onClick={loadMemories}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
              <p className="text-sm text-amber-800 mb-4">Past incidents, conversations, and outcomes (view, edit, delete).</p>
            <div className="space-y-4">
              {memories.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-gray-500 mb-2">No episodic memories yet.</p>
                  <p className="text-sm text-gray-400">Send tickets in <strong>Chat & Agents</strong> to build episodic memory from incidents and outcomes.</p>
                </div>
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
                          type="button"
                          onClick={() => openEditMemory(memory)}
                          className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm flex items-center"
                          aria-label={`Edit memory ${memory.id}`}
                        >
                          <Edit2 size={14} className="mr-1" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMemory(memory.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          aria-label={`Delete memory ${memory.id}`}
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

            <div className="pt-6 border-t border-gray-200 border-l-4 border-l-indigo-500 pl-6 -ml-2">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-indigo-900">Semantic Memory</h2>
                <button
                  type="button"
                  onClick={loadSemanticMemories}
                  disabled={semanticLoading}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
                >
                  {semanticLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <p className="text-sm text-indigo-700 mb-4">Documents, FAQs, runbooks (RAG knowledge base).</p>
              {semanticLoading && semanticMemories.length === 0 ? (
                <p className="text-gray-500 text-center py-6">Loading semantic memory...</p>
              ) : semanticMemories.length === 0 ? (
                <div className="text-center py-6 px-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-gray-500">No semantic memories returned.</p>
                  <p className="text-xs text-gray-400 mt-1">Backend may index docs via ingest; list appears when available.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {semanticMemories.map((item: any, i: number) => (
                    <li key={item?.id ?? i} className="border rounded-lg p-4 bg-slate-50 hover:bg-slate-100">
                      {item?.doc_type && <span className="text-xs font-medium text-slate-600 px-2 py-0.5 rounded bg-slate-200">{item.doc_type}</span>}
                      <p className="mt-2 text-gray-800 text-sm">{item?.content ?? item?.text ?? item?.chunk ?? JSON.stringify(item).slice(0, 200)}</p>
                      {item?.metadata && Object.keys(item.metadata).length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">{JSON.stringify(item.metadata)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'monitoring' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">System Monitoring</h2>
            <p className="text-sm text-gray-600 mb-4">
              Agents run in sequence when you send a ticket. Open <strong>Chat & Agents</strong> to see the live stream and pipeline.
            </p>
            {backendStatus !== null && (
              <div className={`mb-4 px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${backendStatus === 'ok' ? 'bg-emerald-50 text-emerald-800' : backendStatus === 'checking' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-800'}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${backendStatus === 'ok' ? 'bg-emerald-500' : backendStatus === 'checking' ? 'bg-slate-400 animate-pulse' : 'bg-red-500'}`} />
                Backend: {backendStatus === 'ok' ? 'Connected' : backendStatus === 'checking' ? 'Checking...' : 'Unavailable'}
              </div>
            )}
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
              <div className="bg-orange-50 rounded-lg p-4">
                <h3 className="font-semibold text-orange-800">Tool calls (last run)</h3>
                <p className="text-2xl font-bold text-orange-600">{toolCallsThisRun.length}</p>
              </div>
              {result && (
                <div className={`rounded-lg p-4 ${result.action === 'ESCALATE' ? 'bg-amber-50' : result.action === 'BLOCK' ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                  <h3 className={`font-semibold ${result.action === 'ESCALATE' ? 'text-amber-800' : result.action === 'BLOCK' ? 'text-rose-800' : 'text-emerald-800'}`}>
                    Last outcome (Guardrails)
                  </h3>
                  <p className={`text-lg font-bold ${result.action === 'ESCALATE' ? 'text-amber-600' : result.action === 'BLOCK' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {result.action === 'ESCALATE' ? 'Escalated' : result.action === 'BLOCK' ? 'Blocked' : 'Auto-response'}
                  </p>
                </div>
              )}
              {completedPipelineSteps.length > 0 && (
                <div className="md:col-span-3 bg-amber-50 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-800 mb-2">Last run – Agent pipeline</h3>
                  <p className="text-sm text-amber-900">
                    {completedPipelineSteps.length} of {AGENT_PIPELINE.length} steps ran:{' '}
                    {completedPipelineSteps.map((i) => AGENT_PIPELINE[i].short).join(' → ')}
                    {runDurationMs > 0 && (
                      <span className="text-amber-700 ml-1">(in ~{(runDurationMs / 1000).toFixed(1)}s)</span>
                    )}
                  </p>
                </div>
              )}
              {events.length > 0 && (
                <div className="md:col-span-3 bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-slate-800 flex items-center justify-between">
                    Last run – Observability
                    <button
                      type="button"
                      onClick={exportTrace}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                    >
                      <Download size={12} />
                      Export trace
                    </button>
                  </h3>
                  {stepTiming.length > 0 && (
                    <p className="text-xs text-slate-600">
                      <strong>Step timing:</strong>{' '}
                      {stepTiming.map(({ name, ms }) => `${name} ${(ms / 1000).toFixed(2)}s`).join(', ')}
                    </p>
                  )}
                  {Object.keys(eventsPerAgent).length > 0 && (
                    <p className="text-xs text-slate-600">
                      <strong>Events per agent:</strong>{' '}
                      {Object.entries(eventsPerAgent).map(([a, c]) => `${a} ${c}`).join(', ')}
                    </p>
                  )}
                  {(runErrorsAndWarnings.errors.length > 0 || runErrorsAndWarnings.warnings.length > 0) && (
                    <p className="text-xs text-red-600">
                      Errors: {runErrorsAndWarnings.errors.length}, Warnings: {runErrorsAndWarnings.warnings.length}
                    </p>
                  )}
                </div>
              )}

              {backendStatus === 'ok' && (
                <>
                  <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-100 border border-slate-200">
                    <span className="font-medium text-slate-700">Backend observability</span>
                    <div className="flex items-center gap-3 text-sm">
                      {observabilityLastUpdated && !observabilityLoading && (
                        <span className="text-slate-500">Last updated: {observabilityLastUpdated.toLocaleTimeString()}</span>
                      )}
                      <button
                        type="button"
                        onClick={loadObservability}
                        disabled={observabilityLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Refresh observability data"
                      >
                        {observabilityLoading ? (
                          <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Activity size={16} />
                        )}
                        Refresh
                      </button>
                    </div>
                  </div>
                  {observabilityLoading && (
                    <div className="md:col-span-3 text-sm text-slate-500 flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      Loading backend observability…
                    </div>
                  )}
                  {!observabilityLoading && !aiMetricsSummary && observabilityEvents.length === 0 && observabilityToolCalls.length === 0 && observabilityLlmCalls.length === 0 && !(observabilityTrace?.execution_trace?.length) && (
                    <div className="md:col-span-3 p-4 rounded-lg bg-slate-50 border border-slate-200 text-center text-slate-600 text-sm">
                      <p className="font-medium mb-1">No observability data yet</p>
                      <p>Run a ticket in <strong>Chat & Agents</strong> to see AI metrics, events, tool calls, and execution traces here. Click <strong>Refresh</strong> after a run to load the latest data.</p>
                    </div>
                  )}
                  {aiMetricsSummary && !observabilityLoading && (
                    <div className="md:col-span-3 bg-indigo-50 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMonitoringSectionOpen((s) => ({ ...s, aiMetrics: !s.aiMetrics }))}
                        className="w-full flex items-center justify-between gap-2 flex-wrap p-4 text-left font-semibold text-indigo-800 hover:bg-indigo-100/50"
                        aria-expanded={monitoringSectionOpen.aiMetrics}
                      >
                        <span className="flex items-center gap-2">
                          <Activity size={16} />
                          AI metrics (backend)
                        </span>
                        {monitoringSectionOpen.aiMetrics ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {monitoringSectionOpen.aiMetrics && (
                      <div className="px-4 pb-4 space-y-3">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            fetch('/api/observability/ai-metrics/export?days=30')
                              .then((r) => r.ok ? r.json() : null)
                              .then((data) => {
                                if (!data || data.error) return
                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `ai-metrics-export-${new Date().toISOString().slice(0, 10)}.json`
                                a.click()
                                URL.revokeObjectURL(url)
                              })
                          }}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-indigo-300 bg-white hover:bg-indigo-100 text-indigo-700"
                        >
                          <Download size={12} />
                          Export AI metrics
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {(aiMetricsSummary.total_llm_calls != null || aiMetricsSummary.total_tokens != null) && (
                          <>
                            {aiMetricsSummary.total_llm_calls != null && (
                              <div>
                                <span className="text-indigo-600 font-medium">LLM calls</span>
                                <p className="text-lg font-bold text-indigo-800">{Number(aiMetricsSummary.total_llm_calls).toLocaleString()}</p>
                              </div>
                            )}
                            {aiMetricsSummary.total_embedding_calls != null && (
                              <div>
                                <span className="text-indigo-600 font-medium">Embedding calls</span>
                                <p className="text-lg font-bold text-indigo-800">{Number(aiMetricsSummary.total_embedding_calls).toLocaleString()}</p>
                              </div>
                            )}
                            {aiMetricsSummary.total_tokens != null && (
                              <div>
                                <span className="text-indigo-600 font-medium">Total tokens</span>
                                <p className="text-lg font-bold text-indigo-800">{Number(aiMetricsSummary.total_tokens).toLocaleString()}</p>
                              </div>
                            )}
                            {aiMetricsSummary.total_cost_usd != null && (
                              <div>
                                <span className="text-indigo-600 font-medium">Cost (USD)</span>
                                <p className="text-lg font-bold text-indigo-800">${Number(aiMetricsSummary.total_cost_usd).toFixed(2)}</p>
                              </div>
                            )}
                            {aiMetricsSummary.avg_latency_ms != null && (
                              <div>
                                <span className="text-indigo-600 font-medium">Avg latency</span>
                                <p className="text-lg font-bold text-indigo-800">{Number(aiMetricsSummary.avg_latency_ms).toFixed(0)} ms</p>
                              </div>
                            )}
                            {aiMetricsSummary.error_rate != null && (
                              <div>
                                <span className="text-indigo-600 font-medium">Error rate</span>
                                <p className="text-lg font-bold text-indigo-800">{(Number(aiMetricsSummary.error_rate) * 100).toFixed(2)}%</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {aiMetricsSummary.by_agent && Object.keys(aiMetricsSummary.by_agent).length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-indigo-700 mb-1">By agent</p>
                          <ul className="text-xs text-indigo-900 space-y-0.5">
                            {Object.entries(aiMetricsSummary.by_agent).map(([agent, m]: [string, any]) => (
                              <li key={agent}>
                                {agent}: {m.calls != null ? `${m.calls} calls` : ''} {m.tokens != null ? `, ${Number(m.tokens).toLocaleString()} tokens` : ''} {m.cost != null ? `, $${Number(m.cost).toFixed(2)}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      </div>
                      )}
                    </div>
                  )}
                  {observabilityTrace?.execution_trace && observabilityTrace.execution_trace.length > 0 && !observabilityLoading && (
                    <div className="md:col-span-3 bg-violet-50 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMonitoringSectionOpen((s) => ({ ...s, executionTrace: !s.executionTrace }))}
                        className="w-full flex items-center justify-between gap-2 p-4 text-left font-semibold text-violet-800 hover:bg-violet-100/50"
                        aria-expanded={monitoringSectionOpen.executionTrace}
                      >
                        Execution trace (task: {observabilityTrace.task_id?.slice(0, 8)}…)
                        {monitoringSectionOpen.executionTrace ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {monitoringSectionOpen.executionTrace && (
                      <div className="px-4 pb-4 space-y-2">
                      <ul className="text-sm text-violet-900 space-y-1">
                        {observabilityTrace.execution_trace.slice(0, 15).map((step: any, i: number) => (
                          <li key={i}>
                            {step.step != null ? `${step.step}. ` : ''}{step.agent ?? step.agent_name ?? 'Agent'}: {step.action ?? step.message ?? step.status ?? '—'}
                          </li>
                        ))}
                        {observabilityTrace.execution_trace.length > 15 && (
                          <li className="text-violet-600">… +{observabilityTrace.execution_trace.length - 15} more</li>
                        )}
                      </ul>
                      </div>
                      )}
                    </div>
                  )}
                  {observabilityEvents.length > 0 && !observabilityLoading && (
                    <div className="md:col-span-3 bg-sky-50 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMonitoringSectionOpen((s) => ({ ...s, events: !s.events }))}
                        className="w-full flex items-center justify-between gap-2 p-4 text-left font-semibold text-sky-800 hover:bg-sky-100/50"
                        aria-expanded={monitoringSectionOpen.events}
                      >
                        Recent events (backend) — {observabilityEvents.length}
                        {monitoringSectionOpen.events ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {monitoringSectionOpen.events && (
                      <div className="px-4 pb-4 space-y-2 max-h-48 overflow-y-auto">
                      <ul className="text-sm text-sky-900 space-y-1 max-h-40 overflow-y-auto">
                        {observabilityEvents.slice(0, 20).map((ev: any, i: number) => (
                          <li key={i}>
                            {ev.agent_name ?? ev.agent ?? '—'} · {ev.action ?? ev.type ?? ev.decision ?? '—'} {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}
                          </li>
                        ))}
                        {observabilityEvents.length > 20 && <li className="text-sky-600">… +{observabilityEvents.length - 20} more</li>}
                      </ul>
                      </div>
                      )}
                    </div>
                  )}
                  {observabilityToolCalls.length > 0 && !observabilityLoading && (
                    <div className="md:col-span-3 bg-amber-50 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMonitoringSectionOpen((s) => ({ ...s, toolCalls: !s.toolCalls }))}
                        className="w-full flex items-center justify-between gap-2 p-4 text-left font-semibold text-amber-800 hover:bg-amber-100/50"
                        aria-expanded={monitoringSectionOpen.toolCalls}
                      >
                        Tool calls (backend) — {observabilityToolCalls.length}
                        {monitoringSectionOpen.toolCalls ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {monitoringSectionOpen.toolCalls && (
                      <div className="px-4 pb-4 space-y-2 max-h-40 overflow-y-auto">
                      <ul className="text-sm text-amber-900 space-y-1 max-h-32 overflow-y-auto">
                        {observabilityToolCalls.slice(0, 15).map((tc: any, i: number) => (
                          <li key={i}>
                            {tc.agent_name ?? tc.agent}: <strong>{tc.tool_name ?? tc.tool}</strong>
                            {tc.execution_time_ms != null ? ` (${Number(tc.execution_time_ms).toFixed(0)} ms)` : ''} {tc.status ? ` [${tc.status}]` : ''}
                          </li>
                        ))}
                        {observabilityToolCalls.length > 15 && <li className="text-amber-600">… +{observabilityToolCalls.length - 15} more</li>}
                      </ul>
                      </div>
                      )}
                    </div>
                  )}
                  {observabilityLlmCalls.length > 0 && !observabilityLoading && (
                    <div className="md:col-span-3 bg-teal-50 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMonitoringSectionOpen((s) => ({ ...s, llmCalls: !s.llmCalls }))}
                        className="w-full flex items-center justify-between gap-2 p-4 text-left font-semibold text-teal-800 hover:bg-teal-100/50"
                        aria-expanded={monitoringSectionOpen.llmCalls}
                      >
                        Recent LLM calls (backend) — {observabilityLlmCalls.length}
                        {monitoringSectionOpen.llmCalls ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {monitoringSectionOpen.llmCalls && (
                      <div className="px-4 pb-4 space-y-2 max-h-40 overflow-y-auto">
                      <ul className="text-sm text-teal-900 space-y-1 max-h-32 overflow-y-auto">
                        {observabilityLlmCalls.slice(0, 10).map((call: any, i: number) => (
                          <li key={i}>
                            {call.agent_name ?? call.agent}: {call.operation ?? call.model} — {(call.total_tokens ?? (call.prompt_tokens != null && call.completion_tokens != null ? call.prompt_tokens + call.completion_tokens : undefined)) ?? '—'} tokens
                            {call.cost_usd != null ? `, $${Number(call.cost_usd).toFixed(4)}` : ''}
                          </li>
                        ))}
                        {observabilityLlmCalls.length > 10 && <li className="text-teal-600">… +{observabilityLlmCalls.length - 10} more</li>}
                      </ul>
                      </div>
                      )}
                    </div>
                  )}
                </>
              )}
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
