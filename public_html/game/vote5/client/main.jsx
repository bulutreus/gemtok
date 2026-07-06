import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import '../../../sıra/gemtok-settings-theme.css';

/* file:// bazı GPU sürücülerinde backdrop-filter tüm sayfayı siyah/boş boyar; CSS ile kapatılır */
if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  document.documentElement.classList.add('vote5-file');
}

class Vote5ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err) {
    console.error(err);
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 24,
            color: '#fff',
            background: '#111',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>Arayüz hatası</strong>
          <p>{String(this.state.err?.message || this.state.err)}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Vote5ErrorBoundary>
      <App />
    </Vote5ErrorBoundary>
  </React.StrictMode>
);
