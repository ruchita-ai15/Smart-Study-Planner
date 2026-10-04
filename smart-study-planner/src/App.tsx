/**
 * Smart Study Planner - Interactive Full-Stack Preview & Code Exporter
 */
import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  Zap,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  AlertTriangle,
  FolderTree,
  FileCode,
  Copy,
  Check,
  Download,
  Terminal,
  Trash2,
  Edit2,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { PROJECT_FILES, ProjectFile } from './projectFiles';

// Types
export interface SubjectItem {
  id: number;
  name: string;
  examDate: string; // YYYY-MM-DD
  description: string;
}

export interface TopicItem {
  id: number;
  subjectId: number;
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedHours: number;
  completed: boolean;
}

export interface PlanSession {
  id: number;
  topicId: number;
  studyDate: string; // YYYY-MM-DD
  plannedHours: number;
  completed: boolean;
}

// Initial Sample Data
const DEFAULT_SUBJECTS: SubjectItem[] = [
  {
    id: 1,
    name: 'Data Structures',
    examDate: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0],
    description: 'Fundamental data organization, linear and tree hierarchies, algorithm analysis.'
  },
  {
    id: 2,
    name: 'Database Management',
    examDate: new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0],
    description: 'Relational model, SQL queries, normalization, ACID transactions and indexing.'
  },
  {
    id: 3,
    name: 'Computer Networks',
    examDate: new Date(Date.now() + 32 * 86400000).toISOString().split('T')[0],
    description: 'Network layers, protocols, addressing, routing, and transport services.'
  }
];

const DEFAULT_TOPICS: TopicItem[] = [
  { id: 1, subjectId: 1, name: 'Arrays', difficulty: 'Easy', estimatedHours: 1.0, completed: true },
  { id: 2, subjectId: 1, name: 'Linked List', difficulty: 'Medium', estimatedHours: 2.0, completed: false },
  { id: 3, subjectId: 1, name: 'Stack', difficulty: 'Easy', estimatedHours: 1.0, completed: false },
  { id: 4, subjectId: 1, name: 'Queue', difficulty: 'Medium', estimatedHours: 1.5, completed: false },
  { id: 5, subjectId: 1, name: 'Trees & BST', difficulty: 'Hard', estimatedHours: 3.0, completed: false },
  { id: 6, subjectId: 2, name: 'SQL Basics & Queries', difficulty: 'Easy', estimatedHours: 1.5, completed: true },
  { id: 7, subjectId: 2, name: 'Normalization (1NF, 2NF, 3NF)', difficulty: 'Hard', estimatedHours: 3.0, completed: false },
  { id: 8, subjectId: 2, name: 'Transactions & ACID Properties', difficulty: 'Medium', estimatedHours: 2.0, completed: false },
  { id: 9, subjectId: 3, name: 'OSI Model & 7 Layers', difficulty: 'Medium', estimatedHours: 2.0, completed: false },
  { id: 10, subjectId: 3, name: 'TCP/IP Handshake & Protocols', difficulty: 'Hard', estimatedHours: 2.5, completed: false }
];

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'subjects' | 'study-plan' | 'generate-plan' | 'code-viewer'>('dashboard');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

  // App Data State (persisted in localStorage)
  const [subjects, setSubjects] = useState<SubjectItem[]>(() => {
    const saved = localStorage.getItem('ssp_subjects');
    return saved ? JSON.parse(saved) : DEFAULT_SUBJECTS;
  });

  const [topics, setTopics] = useState<TopicItem[]>(() => {
    const saved = localStorage.getItem('ssp_topics');
    return saved ? JSON.parse(saved) : DEFAULT_TOPICS;
  });

  const [studyPlans, setStudyPlans] = useState<PlanSession[]>(() => {
    const saved = localStorage.getItem('ssp_plans');
    return saved ? JSON.parse(saved) : [];
  });

  const [dailyHours, setDailyHours] = useState<number>(3.0);
  const [planStartDate, setPlanStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);

  // Modals & Form State
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: '', examDate: '', description: '' });

  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<TopicItem | null>(null);
  const [topicForm, setTopicForm] = useState<{ subjectId: number; name: string; difficulty: 'Easy' | 'Medium' | 'Hard'; estimatedHours: number }>({
    subjectId: 1,
    name: '',
    difficulty: 'Medium',
    estimatedHours: 1.5
  });

  // Code Viewer State
  const [selectedFile, setSelectedFile] = useState<ProjectFile>(PROJECT_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'windows' | 'docker' | 'compose' | 'github' | 'test'>('windows');

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('ssp_subjects', JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    localStorage.setItem('ssp_topics', JSON.stringify(topics));
  }, [topics]);

  useEffect(() => {
    localStorage.setItem('ssp_plans', JSON.stringify(studyPlans));
  }, [studyPlans]);

  // Generate initial study plan on first load if none exists
  useEffect(() => {
    if (studyPlans.length === 0 && topics.length > 0) {
      runSchedulingAlgorithm(3.0, new Date().toISOString().split('T')[0], false);
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Rule-Based Scheduling Algorithm
  const runSchedulingAlgorithm = (hoursPerDay: number, startDateStr: string, notify = true) => {
    const pendingTopics = topics.filter(t => !t.completed);
    if (pendingTopics.length === 0) {
      if (notify) showToast('No pending topics found to schedule!', 'warning');
      return;
    }

    const todayDate = new Date(startDateStr);
    const calculatedWarnings: string[] = [];

    // 1. Calculate Priority Scores
    // Formula: priority = (difficulty_weight * 10) + exam_urgency
    const scoredTopics = pendingTopics.map(topic => {
      const subject = subjects.find(s => s.id === topic.subjectId);
      const examDate = subject ? new Date(subject.examDate) : new Date(Date.now() + 30 * 86400000);
      const diffDays = Math.ceil((examDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const difficultyWeight = topic.difficulty === 'Hard' ? 3 : topic.difficulty === 'Medium' ? 2 : 1;
      const examUrgency = diffDays <= 0 ? 40 : Math.max(0, 30 - Math.min(diffDays, 30));
      const priority = (difficultyWeight * 10) + examUrgency;

      return {
        topic,
        subject,
        examDate,
        priority,
        hoursRemaining: topic.estimatedHours
      };
    });

    // 2. Sort descending by priority (Hard topics & early exams first)
    scoredTopics.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.examDate.getTime() - b.examDate.getTime();
    });

    // 3. Distribute across calendar days
    const newPlans: PlanSession[] = [];
    let currentDate = new Date(todayDate);
    let currentDayUsedHours = 0;
    let planIdCounter = 1;

    for (const item of scoredTopics) {
      let needed = item.hoursRemaining;
      const targetExamDate = item.examDate;

      if (currentDate > targetExamDate) {
        calculatedWarnings.push(
          `Topic "${item.topic.name}" (${item.subject?.name}) is scheduled for ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, which is after its exam date!`
        );
      }

      while (needed > 0.01) {
        const remainingToday = hoursPerDay - currentDayUsedHours;

        if (remainingToday <= 0.01) {
          currentDate = new Date(currentDate.getTime() + 86400000);
          currentDayUsedHours = 0;
          if (currentDate > targetExamDate) {
            const warnText = `Topic "${item.topic.name}" extends past its exam date (${targetExamDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}). Consider increasing daily study hours.`;
            if (!calculatedWarnings.includes(warnText)) calculatedWarnings.push(warnText);
          }
          continue;
        }

        const alloc = Math.min(needed, remainingToday);
        const roundedAlloc = Math.round(alloc * 10) / 10;
        const dateStr = currentDate.toISOString().split('T')[0];

        const existing = newPlans.find(p => p.topicId === item.topic.id && p.studyDate === dateStr);
        if (existing) {
          existing.plannedHours += roundedAlloc;
        } else {
          newPlans.push({
            id: planIdCounter++,
            topicId: item.topic.id,
            studyDate: dateStr,
            plannedHours: roundedAlloc,
            completed: false
          });
        }

        needed -= roundedAlloc;
        currentDayUsedHours += roundedAlloc;
      }
    }

    setStudyPlans(newPlans);
    setWarnings(calculatedWarnings);
    if (notify) {
      showToast(`Generated study plan with ${newPlans.length} study sessions!`, 'success');
      setActiveTab('study-plan');
    }
  };

  // Calculations for Dashboard
  const totalSubjects = subjects.length;
  const totalTopics = topics.length;
  const completedTopics = topics.filter(t => t.completed).length;
  const pendingTopics = totalTopics - completedTopics;
  const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = studyPlans.filter(p => p.studyDate === todayStr);

  const upcomingExams = subjects
    .map(s => {
      const exam = new Date(s.examDate);
      const now = new Date(todayStr);
      const daysLeft = Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...s, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // Group study plan by date
  const groupedStudyPlan: { [dateStr: string]: PlanSession[] } = {};
  studyPlans.forEach(plan => {
    if (!groupedStudyPlan[plan.studyDate]) {
      groupedStudyPlan[plan.studyDate] = [];
    }
    groupedStudyPlan[plan.studyDate].push(plan);
  });

  const sortedPlanDates = Object.keys(groupedStudyPlan).sort();

  // Handlers
  const handleToggleTopic = (topicId: number) => {
    setTopics(prev =>
      prev.map(t => {
        if (t.id === topicId) {
          const nextCompleted = !t.completed;
          if (nextCompleted) {
            setStudyPlans(plans => plans.map(p => p.topicId === topicId ? { ...p, completed: true } : p));
          }
          return { ...t, completed: nextCompleted };
        }
        return t;
      })
    );
    showToast('Topic status updated!', 'info');
  };

  const handleTogglePlanTask = (planId: number) => {
    setStudyPlans(prev =>
      prev.map(p => {
        if (p.id === planId) {
          const nextCompleted = !p.completed;
          // Check if all sessions for topic are completed
          const topicSessions = prev.filter(item => item.topicId === p.topicId && item.id !== planId);
          const allOtherDone = topicSessions.every(item => item.completed);
          if (nextCompleted && allOtherDone) {
            setTopics(ts => ts.map(t => t.id === p.topicId ? { ...t, completed: true } : t));
          } else if (!nextCompleted) {
            setTopics(ts => ts.map(t => t.id === p.topicId ? { ...t, completed: false } : t));
          }
          return { ...p, completed: nextCompleted };
        }
        return p;
      })
    );
  };

  const handleDeleteSubject = (subjectId: number) => {
    if (!confirm('Are you sure you want to delete this subject and its topics?')) return;
    setSubjects(prev => prev.filter(s => s.id !== subjectId));
    setTopics(prev => prev.filter(t => t.subjectId !== subjectId));
    setStudyPlans(prev => prev.filter(p => {
      const topic = topics.find(t => t.id === p.topicId);
      return topic && topic.subjectId !== subjectId;
    }));
    showToast('Subject deleted.', 'info');
  };

  const handleDeleteTopic = (topicId: number) => {
    if (!confirm('Are you sure you want to delete this topic?')) return;
    setTopics(prev => prev.filter(t => t.id !== topicId));
    setStudyPlans(prev => prev.filter(p => p.topicId !== topicId));
    showToast('Topic deleted.', 'info');
  };

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.name.trim() || !subjectForm.examDate) {
      alert('Subject name and exam date are required.');
      return;
    }

    if (editingSubject) {
      setSubjects(prev =>
        prev.map(s => s.id === editingSubject.id ? { ...s, ...subjectForm } : s)
      );
      showToast(`Subject "${subjectForm.name}" updated!`);
    } else {
      const newSubject: SubjectItem = {
        id: Date.now(),
        name: subjectForm.name.trim(),
        examDate: subjectForm.examDate,
        description: subjectForm.description.trim()
      };
      setSubjects(prev => [...prev, newSubject]);
      showToast(`Subject "${newSubject.name}" created!`);
    }

    setIsSubjectModalOpen(false);
    setEditingSubject(null);
  };

  const handleSaveTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicForm.name.trim() || topicForm.estimatedHours <= 0) {
      alert('Valid topic name and study hours (>0) are required.');
      return;
    }

    if (editingTopic) {
      setTopics(prev =>
        prev.map(t => t.id === editingTopic.id ? { ...t, ...topicForm } : t)
      );
      showToast(`Topic "${topicForm.name}" updated!`);
    } else {
      const newTopic: TopicItem = {
        id: Date.now(),
        subjectId: Number(topicForm.subjectId),
        name: topicForm.name.trim(),
        difficulty: topicForm.difficulty,
        estimatedHours: Number(topicForm.estimatedHours),
        completed: false
      };
      setTopics(prev => [...prev, newTopic]);
      showToast(`Topic "${newTopic.name}" added!`);
    }

    setIsTopicModalOpen(false);
    setEditingTopic(null);
  };

  const handleLoadSampleData = () => {
    setSubjects(DEFAULT_SUBJECTS);
    setTopics(DEFAULT_TOPICS);
    localStorage.setItem('ssp_subjects', JSON.stringify(DEFAULT_SUBJECTS));
    localStorage.setItem('ssp_topics', JSON.stringify(DEFAULT_TOPICS));
    runSchedulingAlgorithm(3.0, new Date().toISOString().split('T')[0], false);
    showToast('Loaded sample Computer Science coursework & generated schedule!', 'success');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    PROJECT_FILES.forEach(file => {
      zip.file(file.path, file.content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smart-study-planner.zip';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded smart-study-planner.zip with all 23 files!', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900">Smart Study Planner</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-400">Python · Flask · SQLite · Docker</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('subjects')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'subjects' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Subjects</span>
            </button>
            <button
              onClick={() => setActiveTab('study-plan')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'study-plan' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Study Plan</span>
            </button>
            <button
              onClick={() => setActiveTab('generate-plan')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'generate-plan' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Generate</span>
            </button>
            <button
              onClick={() => setActiveTab('code-viewer')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'code-viewer' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Project Files & ZIP</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium animate-fade-in">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-grow w-full">
        {/* ============================================================== */}
        {/* DASHBOARD TAB                                                 */}
        {/* ============================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Bar Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">SMART STUDY PLANNER</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Plan Smart. Study Better. Keep track of coursework, topic difficulty, and personalized daily schedules.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleLoadSampleData}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Load Sample Data
                </button>
                <button
                  onClick={() => {
                    setEditingSubject(null);
                    setSubjectForm({
                      name: '',
                      examDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                      description: ''
                    });
                    setIsSubjectModalOpen(true);
                  }}
                  className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Subject
                </button>
                <button
                  onClick={() => {
                    if (subjects.length === 0) {
                      alert('Please create a subject first.');
                      return;
                    }
                    setEditingTopic(null);
                    setTopicForm({
                      subjectId: subjects[0].id,
                      name: '',
                      difficulty: 'Medium',
                      estimatedHours: 1.5
                    });
                    setIsTopicModalOpen(true);
                  }}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Topic
                </button>
                <button
                  onClick={() => setActiveTab('generate-plan')}
                  className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Generate Plan
                </button>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Subjects</span>
                <div className="text-3xl font-bold text-slate-900 mt-2">{totalSubjects}</div>
                <div className="text-xs text-slate-500 mt-1">Enrolled modules</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Topics</span>
                <div className="text-3xl font-bold text-slate-900 mt-2">{totalTopics}</div>
                <div className="text-xs text-slate-500 mt-1">{pendingTopics} pending mastery</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completed</span>
                <div className="text-3xl font-bold text-emerald-600 mt-2">{completedTopics}</div>
                <div className="text-xs text-slate-500 mt-1">Concepts mastered</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Progress</span>
                  <span className="text-xs font-bold text-blue-600">{overallProgress}%</span>
                </div>
                <div className="text-3xl font-bold text-blue-600 mt-2">{overallProgress}%</div>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${overallProgress}%` }} />
                </div>
              </div>
            </div>

            {/* Two Column Grid: Today's Tasks & Upcoming Exams */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Today's Tasks */}
              <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <CalendarCheck className="w-4 h-4 text-blue-600" />
                        Today's Study Tasks
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('study-plan')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      View Full Plan <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {todayTasks.length > 0 ? (
                    <div className="space-y-2">
                      {todayTasks.map(session => {
                        const topic = topics.find(t => t.id === session.topicId);
                        const subject = topic ? subjects.find(s => s.id === topic.subjectId) : null;
                        return (
                          <div
                            key={session.id}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                              session.completed ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleTogglePlanTask(session.id)}
                                className="text-slate-400 hover:text-emerald-600 transition-colors"
                              >
                                {session.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                ) : (
                                  <Circle className="w-5 h-5 text-slate-300" />
                                )}
                              </button>
                              <div>
                                <span className={`text-sm font-semibold ${session.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  {topic?.name || 'Study Session'}
                                </span>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                  <span>{subject?.name}</span>
                                  <span>·</span>
                                  <span>{session.plannedHours} hr{session.plannedHours !== 1 ? 's' : ''}</span>
                                  <span>·</span>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    topic?.difficulty === 'Hard' ? 'bg-rose-50 text-rose-700' : topic?.difficulty === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                                  }`}>
                                    {topic?.difficulty}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <span className="text-xs font-medium text-slate-500">
                              {session.completed ? 'Done' : 'Pending'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-700">No study tasks scheduled for today</p>
                      <p className="text-xs text-slate-400 mt-1 mb-4">You're caught up or haven't generated your schedule yet.</p>
                      <button
                        onClick={() => setActiveTab('generate-plan')}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        Generate Study Plan
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Exams */}
              <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-rose-500" />
                      Upcoming Exams
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Countdown to course finals</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('subjects')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Manage
                  </button>
                </div>

                {upcomingExams.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingExams.map(subj => {
                      const subjectTopics = topics.filter(t => t.subjectId === subj.id);
                      return (
                        <div key={subj.id} className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold text-slate-900">{subj.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(subj.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {' · '}{subjectTopics.length} topics
                            </div>
                          </div>
                          <div className="text-right">
                            {subj.daysLeft < 0 ? (
                              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">Passed</span>
                            ) : subj.daysLeft === 0 ? (
                              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded">Today!</span>
                            ) : subj.daysLeft < 7 ? (
                              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded">{subj.daysLeft}d left</span>
                            ) : (
                              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">{subj.daysLeft}d left</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No subjects added yet.
                  </div>
                )}
              </div>
            </div>

            {/* Subject-Wise Progress Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Subject-Wise Progress
                </h2>
                <button
                  onClick={() => setActiveTab('subjects')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  View All Subjects &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {subjects.map(s => {
                  const subTopics = topics.filter(t => t.subjectId === s.id);
                  const subDone = subTopics.filter(t => t.completed).length;
                  const pct = subTopics.length > 0 ? Math.round((subDone / subTopics.length) * 100) : 0;
                  return (
                    <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-900 truncate">{s.name}</span>
                        <span className="text-xs font-bold text-blue-600">{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mb-2">
                        <div className={`h-1.5 rounded-full ${pct === 100 ? 'bg-emerald-600' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{subDone}/{subTopics.length} topics</span>
                        <button
                          onClick={() => {
                            setSelectedSubjectId(s.id);
                            setActiveTab('subjects');
                          }}
                          className="text-blue-600 font-medium hover:underline"
                        >
                          View Topics &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBJECTS & TOPICS TAB                                         */}
        {/* ============================================================== */}
        {activeTab === 'subjects' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Courses & Syllabus Topics</h1>
                <p className="text-sm text-slate-500">Manage academic subjects, target exam dates, and individual topics with difficulty ratings.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingSubject(null);
                    setSubjectForm({
                      name: '',
                      examDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                      description: ''
                    });
                    setIsSubjectModalOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Subject
                </button>
              </div>
            </div>

            {/* Subjects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {subjects.map(s => {
                const subTopics = topics.filter(t => t.subjectId === s.id);
                const subDone = subTopics.filter(t => t.completed).length;
                const pct = subTopics.length > 0 ? Math.round((subDone / subTopics.length) * 100) : 0;
                const isSelected = selectedSubjectId === s.id;

                return (
                  <div
                    key={s.id}
                    className={`bg-white rounded-2xl border transition-all flex flex-col justify-between ${
                      isSelected ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-base text-slate-900">{s.name}</h3>
                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                          {new Date(s.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-4">{s.description || 'No description provided.'}</p>

                      <div className="space-y-1.5 mb-4">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Mastery</span>
                          <span className="font-bold text-slate-700">{pct}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-1.5 rounded-full ${pct === 100 ? 'bg-emerald-600' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 flex justify-between">
                        <span>{subTopics.length} total topics</span>
                        <span className="text-emerald-600 font-medium">{subDone} completed</span>
                      </div>
                    </div>

                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex items-center justify-between">
                      <button
                        onClick={() => setSelectedSubjectId(isSelected ? null : s.id)}
                        className={`text-xs font-semibold flex items-center gap-1 ${
                          isSelected ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {isSelected ? 'Hide Topics' : 'Manage Topics'} <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingSubject(s);
                            setSubjectForm({
                              name: s.name,
                              examDate: s.examDate,
                              description: s.description
                            });
                            setIsSubjectModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
                          title="Edit Subject"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSubject(s.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                          title="Delete Subject"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Subject's Topics Drawer / Section */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {selectedSubjectId
                      ? `Topics under ${subjects.find(s => s.id === selectedSubjectId)?.name}`
                      : 'All Course Topics'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click checkboxes to toggle completion. Hard topics (Priority 3) are scheduled earliest.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedSubjectId && (
                    <button
                      onClick={() => setSelectedSubjectId(null)}
                      className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      Show All Topics
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingTopic(null);
                      setTopicForm({
                        subjectId: selectedSubjectId || (subjects[0]?.id ?? 1),
                        name: '',
                        difficulty: 'Medium',
                        estimatedHours: 1.5
                      });
                      setIsTopicModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Topic
                  </button>
                </div>
              </div>

              {/* Topics Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3 w-10">Status</th>
                      <th className="py-3 px-3">Topic Name</th>
                      <th className="py-3 px-3">Subject</th>
                      <th className="py-3 px-3">Difficulty</th>
                      <th className="py-3 px-3">Est. Hours</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topics
                      .filter(t => (selectedSubjectId ? t.subjectId === selectedSubjectId : true))
                      .map(topic => {
                        const parentSubj = subjects.find(s => s.id === topic.subjectId);
                        return (
                          <tr key={topic.id} className={`hover:bg-slate-50/70 transition-colors ${topic.completed ? 'opacity-60 bg-slate-50/30' : ''}`}>
                            <td className="py-3 px-3">
                              <button
                                onClick={() => handleToggleTopic(topic.id)}
                                className="text-slate-400 hover:text-emerald-600"
                              >
                                {topic.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                ) : (
                                  <Circle className="w-5 h-5 text-slate-300" />
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`font-semibold ${topic.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                {topic.name}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs text-slate-500 font-medium">
                              {parentSubj?.name || 'Unassigned'}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                topic.difficulty === 'Hard'
                                  ? 'bg-rose-50 text-rose-700'
                                  : topic.difficulty === 'Medium'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {topic.difficulty} (P{topic.difficulty === 'Hard' ? 3 : topic.difficulty === 'Medium' ? 2 : 1})
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs text-slate-600 font-medium">
                              {topic.estimatedHours} hr{topic.estimatedHours !== 1 ? 's' : ''}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleToggleTopic(topic.id)}
                                  className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                                    topic.completed
                                      ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                                      : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                  }`}
                                >
                                  {topic.completed ? 'Redo' : 'Mark Done'}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingTopic(topic);
                                    setTopicForm({
                                      subjectId: topic.subjectId,
                                      name: topic.name,
                                      difficulty: topic.difficulty,
                                      estimatedHours: topic.estimatedHours
                                    });
                                    setIsTopicModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTopic(topic.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STUDY PLAN TIMELINE TAB                                       */}
        {/* ============================================================== */}
        {activeTab === 'study-plan' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Your Personalized Study Schedule</h1>
                <p className="text-sm text-slate-500">
                  Priority-ordered timetable automatically generated based on topic difficulty and upcoming exam deadlines.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('generate-plan')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Regenerate Schedule
                </button>
              </div>
            </div>

            {/* Warnings Alert Banner (if any) */}
            {warnings.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Schedule Deadline Warnings:</span>
                </div>
                {warnings.map((w, idx) => (
                  <p key={idx} className="pl-5 text-amber-700">{w}</p>
                ))}
              </div>
            )}

            {/* Schedule Cards Grouped by Date */}
            {sortedPlanDates.length > 0 ? (
              <div className="space-y-5">
                {sortedPlanDates.map(dateStr => {
                  const tasksForDay = groupedStudyPlan[dateStr];
                  const dObj = new Date(dateStr + 'T00:00:00');
                  const dayName = dObj.toLocaleDateString('en-US', { weekday: 'long' });
                  const formattedDate = dObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                  const isToday = dateStr === todayStr;
                  const dayTotalHours = tasksForDay.reduce((acc, cur) => acc + cur.plannedHours, 0);

                  return (
                    <div
                      key={dateStr}
                      className={`bg-white rounded-2xl border p-5 transition-shadow ${
                        isToday ? 'border-blue-600 ring-2 ring-blue-100 shadow-sm' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                            isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {dayName}
                          </span>
                          <span className="font-bold text-sm text-slate-900">{formattedDate}</span>
                          {isToday && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              TODAY
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          Total Planned: <span className="font-bold text-slate-800">{Math.round(dayTotalHours * 10) / 10} hrs</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {tasksForDay.map(session => {
                          const topic = topics.find(t => t.id === session.topicId);
                          const subject = topic ? subjects.find(s => s.id === topic.subjectId) : null;
                          return (
                            <div
                              key={session.id}
                              className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                                session.completed ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handleTogglePlanTask(session.id)}
                                  className="text-slate-400 hover:text-emerald-600 transition-colors"
                                >
                                  {session.completed ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                  ) : (
                                    <Circle className="w-5 h-5 text-slate-300" />
                                  )}
                                </button>
                                <div>
                                  <span className={`text-sm font-semibold ${session.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                    {topic?.name}
                                  </span>
                                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                    <span className="font-medium text-slate-700">{subject?.name}</span>
                                    <span>·</span>
                                    <span>Exam: {subject ? new Date(subject.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</span>
                                    <span>·</span>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                      topic?.difficulty === 'Hard' ? 'bg-rose-50 text-rose-700' : topic?.difficulty === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                                    }`}>
                                      {topic?.difficulty}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                                  {session.plannedHours} hr{session.plannedHours !== 1 ? 's' : ''}
                                </span>
                                <span className="text-xs font-medium text-slate-500 hidden sm:inline-block">
                                  {session.completed ? 'Done' : 'Pending'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-base text-slate-800">No active study plan</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                  Run the rule-based generator to distribute your pending topics into a balanced daily timetable.
                </p>
                <button
                  onClick={() => setActiveTab('generate-plan')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                >
                  Generate Plan Now
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* GENERATE PLAN TAB                                             */}
        {/* ============================================================== */}
        {activeTab === 'generate-plan' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 tracking-tight">Generate Study Plan</h1>
                  <p className="text-xs text-slate-500">Automated rule-based scheduling for pending syllabus topics.</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runSchedulingAlgorithm(dailyHours, planStartDate, true);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Available Study Hours Per Day *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="16"
                      value={dailyHours}
                      onChange={(e) => setDailyHours(parseFloat(e.target.value) || 1)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                      required
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-medium">hours / day</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    How many hours can you realistically commit each day without burnout?
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Calendar date from which revision sessions begin.</p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    Generate My Schedule Now
                  </button>
                </div>
              </form>
            </div>

            {/* Algorithm Explanation Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-600" />
                How the Rule-Based Scheduling Algorithm Operates
              </h2>
              <ul className="text-xs text-slate-600 space-y-2.5 list-disc pl-5">
                <li>
                  <strong>Difficulty Weighting:</strong> Hard topics (weight 3) are scheduled earlier than Medium (2) and Easy (1) to tackle complex concepts first.
                </li>
                <li>
                  <strong>Exam Urgency:</strong> Topics belonging to subjects with upcoming target exam dates receive higher priority.
                </li>
                <li>
                  <strong>Workload Balancing:</strong> Daily hours are strictly capped at your available hours to prevent burnout.
                </li>
                <li>
                  <strong>Deadline Protection:</strong> Topics are scheduled before their subject's exam date; warnings are displayed if additional daily study time is needed.
                </li>
                <li>
                  <strong>Completed Topics Excluded:</strong> Any topic already marked completed is automatically omitted from new schedules.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PROJECT FILES & EXPORTER TAB                                  */}
        {/* ============================================================== */}
        {activeTab === 'code-viewer' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Project Source Code & Docker Bundle</h1>
                <p className="text-sm text-slate-500">
                  Inspect all 23 project files, copy any file, or download the complete ready-to-run repository as a ZIP.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadZip}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download ZIP (23 Files)
                </button>
              </div>
            </div>

            {/* Quick Setup Guides Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Execution Guides:</span>
                {[
                  { id: 'windows', label: 'Windows Setup' },
                  { id: 'docker', label: 'Docker Run' },
                  { id: 'compose', label: 'Docker Compose' },
                  { id: 'github', label: 'GitHub Upload' },
                  { id: 'test', label: 'Testing Checklist' }
                ].map(guide => (
                  <button
                    key={guide.id}
                    onClick={() => setActiveGuideTab(guide.id as any)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      activeGuideTab === guide.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {guide.label}
                  </button>
                ))}
              </div>

              {activeGuideTab === 'windows' && (
                <div className="text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">Run without Docker on Windows:</p>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed">
{`cd smart-study-planner
python -m venv venv
venv\\Scripts\\activate
pip install -r requirements.txt
python run.py

# Open in browser: http://localhost:5000`}
                  </pre>
                </div>
              )}

              {activeGuideTab === 'docker' && (
                <div className="text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">Build and run using Docker:</p>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed">
{`# Build the image
docker build -t smart-study-planner .

# Run container mapping port 5000
docker run -p 5000:5000 smart-study-planner

# Open in browser: http://localhost:5000`}
                  </pre>
                </div>
              )}

              {activeGuideTab === 'compose' && (
                <div className="text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">Run using Docker Compose (with SQLite volume persistence):</p>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed">
{`# Build and run with volume mount
docker compose up --build

# To stop:
docker compose down`}
                  </pre>
                </div>
              )}

              {activeGuideTab === 'github' && (
                <div className="text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">Upload to your GitHub repository:</p>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed">
{`git init
git add .
git commit -m "Initial commit: Smart Study Planner"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main`}
                  </pre>
                </div>
              )}

              {activeGuideTab === 'test' && (
                <div className="text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">How to test all 5 major features:</p>
                  <ol className="list-decimal pl-5 space-y-1 text-slate-600">
                    <li><strong>Load Sample Data:</strong> Click "Load Sample Data" to seed Data Structures, DBMS, and Networks.</li>
                    <li><strong>Dashboard Metrics:</strong> Verify total subjects (3), topics (10), completed (2), and progress (20%).</li>
                    <li><strong>Generate Plan:</strong> Go to /generate-plan, enter 3.0 daily hours, and submit. Verify priority scheduling.</li>
                    <li><strong>Complete a Task:</strong> Click checkbox on a task in /study-plan or dashboard. Check progress updates dynamically.</li>
                    <li><strong>Add/Edit Subject:</strong> Create a new subject with exam date 15 days out and add 2 topics.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Split File Explorer and Code Preview */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* File List */}
              <div className="md:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 h-[650px] flex flex-col">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Files ({PROJECT_FILES.length})</span>
                  <span className="text-[11px] text-slate-500">smart-study-planner/</span>
                </div>
                <div className="overflow-y-auto space-y-1 flex-grow pr-1">
                  {PROJECT_FILES.map(file => {
                    const isSelected = selectedFile.path === file.path;
                    return (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileCode className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                          <span className="truncate">{file.path}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">{file.language}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Code Viewer Panel */}
              <div className="md:col-span-8 bg-slate-900 rounded-2xl border border-slate-800 p-5 h-[650px] flex flex-col text-slate-100">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div>
                    <div className="text-xs font-bold text-emerald-400 font-mono">{selectedFile.path}</div>
                    <div className="text-[11px] text-slate-400">{selectedFile.description}</div>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
                <div className="overflow-auto flex-grow font-mono text-xs leading-relaxed text-slate-300">
                  <pre className="p-2">{selectedFile.content}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* MODALS: ADD / EDIT SUBJECT                                     */}
      {/* ============================================================== */}
      {isSubjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {editingSubject ? 'Edit Subject' : 'Add New Subject'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">Set subject title, scheduled exam date, and notes.</p>

            <form onSubmit={handleSaveSubject} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Name *</label>
                <input
                  type="text"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  placeholder="e.g. Data Structures & Algorithms"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Exam Date *</label>
                <input
                  type="date"
                  value={subjectForm.examDate}
                  onChange={(e) => setSubjectForm({ ...subjectForm, examDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={subjectForm.description}
                  onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
                  placeholder="Syllabus notes, instructor info..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Save Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODALS: ADD / EDIT TOPIC                                       */}
      {/* ============================================================== */}
      {isTopicModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {editingTopic ? 'Edit Topic' : 'Add New Topic'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">Higher difficulty topics receive early priority.</p>

            <form onSubmit={handleSaveTopic} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
                <select
                  value={topicForm.subjectId}
                  onChange={(e) => setTopicForm({ ...topicForm, subjectId: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none bg-white"
                  required
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (Exam: {s.examDate})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Topic Name *</label>
                <input
                  type="text"
                  value={topicForm.name}
                  onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
                  placeholder="e.g. Dynamic Programming, Normalization..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Difficulty Level</label>
                  <select
                    value={topicForm.difficulty}
                    onChange={(e) => setTopicForm({ ...topicForm, difficulty: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none bg-white"
                  >
                    <option value="Easy">Easy (Priority 1)</option>
                    <option value="Medium">Medium (Priority 2)</option>
                    <option value="Hard">Hard (Priority 3)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Est. Study Hours *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="20"
                    value={topicForm.estimatedHours}
                    onChange={(e) => setTopicForm({ ...topicForm, estimatedHours: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsTopicModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Save Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>Smart Study Planner</strong> · Deterministic academic scheduling engine for students.
          </div>
          <div>
            Built with Python 3.12, Flask, SQLAlchemy, SQLite, Bootstrap 5 & Docker
          </div>
        </div>
      </footer>
    </div>
  );
}
