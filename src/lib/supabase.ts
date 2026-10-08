// Custom Localhost API Client (Replaces Supabase Cloud)

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/api$/, '') + '/api/db';

class QueryBuilder {
  table;
  matchCond = {};
  actionStr = 'select';
  dataPayload = null;
  selectQuery = '*';
  isSingle = false;

  constructor(table) {
    this.table = table;
  }

  select(query = '*') {
    if (this.actionStr === 'select' || !this.actionStr) {
      this.actionStr = 'select';
    }
    this.selectQuery = query;
    return this;
  }

  rpc(params) {
    this.actionStr = 'rpc';
    this.dataPayload = params;
    return this;
  }

  insert(data) {
    this.actionStr = 'insert';
    this.dataPayload = Array.isArray(data) ? data[0] : data; // Simplification
    return this;
  }

  upsert(data) {
    this.actionStr = 'upsert';
    this.dataPayload = Array.isArray(data) ? data[0] : data;
    return this;
  }

  update(data) {
    this.actionStr = 'update';
    this.dataPayload = data;
    return this;
  }

  eq(column, value) {
    this.matchCond[column] = value;
    return this;
  }

  in(column, values) {
    if (values && values.length > 0) {
      this.matchCond[column] = values[0]; // simplistic mock
    }
    return this;
  }
  
  gte(column, value) { return this; }
  lte(column, value) { return this; }
  neq(column, value) { return this; }
  order(column, options) { return this; }
  limit(count) { return this; }
  single() {
    this.isSingle = true;
    return this;
  }
  maybeSingle() {
    this.isSingle = true;
    return this;
  }
  is(column, value) {
    this.matchCond[column] = value;
    return this;
  }
  ilike(column, value) {
    this.matchCond[column] = value; // simple mock for ilike
    return this;
  }
  or(val) { return this; }
  
  delete() {
    this.actionStr = 'delete';
    return this;
  }

  async then(resolve, reject) {
    try {
      const token = localStorage.getItem('crm_token');
      const res = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          table: this.table,
          action: this.actionStr,
          match: this.matchCond,
          data: this.dataPayload,
          select: this.selectQuery
        })
      });
      const result = await res.json();
      
      let finalData = result.data;
      if (this.isSingle && Array.isArray(finalData)) {
        finalData = finalData[0] || null;
      }
      
      const count = Array.isArray(result.data) ? result.data.length : null;
      
      resolve({ data: finalData, count, error: result.error });
    } catch (err) {
      resolve({ data: null, error: err });
    }
  }
}

export const supabase: any = {
  from: (table: string) => new QueryBuilder(table),
  auth: {
    getSession: async () => {
      const token = localStorage.getItem('crm_token');
      const userStr = localStorage.getItem('crm_user');
      if (token && userStr) {
        return { data: { session: { access_token: token, user: JSON.parse(userStr) } }, error: null };
      }
      return { data: { session: null }, error: null };
    },
    onAuthStateChange: (cb: any) => {
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signOut: async () => {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      window.location.href = '/login';
      return { error: null };
    },
    signInWithPassword: async ({ email, password }: any) => {
      try {
        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/api$/, '') + '/api';
        const res = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) return { data: null, error: new Error(data.error) };
        
        localStorage.setItem('crm_token', data.session.access_token);
        localStorage.setItem('crm_user', JSON.stringify(data.user));
        
        // Force a reload so the frontend picks up the new session from getSession()
        window.location.href = '/#/dashboard';
        window.location.reload();
        
        return { data: data, error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    signUp: async ({ email, password, options }: any) => {
      try {
        const full_name = options?.data?.full_name || '';
        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/api$/, '') + '/api';
        const res = await fetch(`${apiUrl}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name })
        });
        const data = await res.json();
        if (data.error) return { data: null, error: new Error(data.error) };
        
        localStorage.setItem('crm_token', data.session.access_token);
        localStorage.setItem('crm_user', JSON.stringify(data.user));
        
        window.location.href = '/#/dashboard';
        window.location.reload();
        
        return { data: data, error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    }
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: any) => {
        return { data: { path }, error: null };
      },
      getPublicUrl: (path: string) => {
        return { data: { publicUrl: `http://localhost:3001/storage/${bucket}/${path}` } };
      }
    })
  },
  rpc: async (functionName: string, params: any) => {
    return new QueryBuilder(functionName).rpc(params);
  },
  channel: (name: string) => {
    const channelMock = {
      on: (event: any, filter: any, callback: any) => channelMock,
      subscribe: (callback?: any) => {
        if (callback) callback('SUBSCRIBED');
        return channelMock;
      },
      unsubscribe: () => {}
    };
    return channelMock;
  },
  removeChannel: async (channel: any) => {
    return { error: null };
  },
  functions: {
    invoke: async (functionName: string, options?: any) => {
      console.warn(`Forwarding edge function to local backend: ${functionName}`);
      
      if (functionName === 'ai-generate') {
        // Return a mock AI response so the UI doesn't break and can be tested
        return { 
          data: { 
            success: true, 
            content: "This is a placeholder AI response. Since this is running in a local environment without Supabase Edge Functions, actual AI generation is disabled. You can replace this text manually." 
          }, 
          error: null 
        };
      }
      
      try {
        const response = await fetch(`http://localhost:3001/functions/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ functionName, options })
        });
        const data = await response.json();
        if (!response.ok) {
          return { data: null, error: { message: data.error || 'Failed to invoke function' } };
        }
        return { data: data.data, error: null };
      } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : 'Network error' } };
      }
    }
  }
};

