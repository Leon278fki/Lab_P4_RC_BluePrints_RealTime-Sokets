import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../../services/apiClient.js'

// Thunks (Acciones asincronas)
export const fetchByAuthor = createAsyncThunk(
    'blueprints/fetchByAuthor',
    async (author) => {
        const { data } = await api.get(`/blueprints/${encodeURIComponent(author)}`);
        return { author, items: data.data }
    }
);

export const createBlueprint = createAsyncThunk(
    'blueprints/createBlueprint',
    async (payload) => {
        const { data } = await api.post('/blueprints', payload);
        return data.data;
    }
);

export const updateBlueprint = createAsyncThunk(
    'blueprints/updateBlueprint',
    async ({ author, name, points }) => {
        await api.put(`blueprints/${author}/${name}`, points);
        return { author, name, points };
    }
);

export const deleteBlueprint = createAsyncThunk(
    'blueprints/deleteBlueprint',
    async ({ author, name }) => {
        await api.delete(`/blueprints/${author}/${name}`);
        return { author, name };
    }
);

// Slice
const slice = createSlice({
    name: 'blueprints',
    initialState: {
        byAuthor: {},
        current: null,
        currentAuthor: '',
        status: 'idle',
        error: null,
    },
    reducers: {
        setCurrentAuthor(state, action) {
            state.currentAuthor = action.payload;
        },
        setCurrentBlueprint(state, action) {
            state.current = action.payload;
        },
        appendPoint(state, action) {
            if (state.current) {
                state.current.points.push(action.payload);
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchByAuthor.pending, (s) => { s.status = 'loading'; s.error = null })
            .addCase(fetchByAuthor.fulfilled, (s, a) => {
                s.status = 'succeeded';
                s.byAuthor[a.payload.author] = a.payload.items;
            })
            .addCase(fetchByAuthor.rejected, (s, a) => {
                s.status = 'failed';
                s.error = a.error.message;
            })
            .addCase(createBlueprint.fulfilled, (s, a) => {
                const bp = a.payload;
                if (!s.byAuthor[bp.author]) s.byAuthor[bp.author] = []
                s.byAuthor[bp.author].push(bp);
            })
            .addCase(updateBlueprint.fulfilled, (s, a) => {
                const { author, name, points } = a.payload;
                const list = s.byAuthor[author];
                if (list) {
                    const bp = list.find(b => b.name === name);
                    if (bp) bp.points = points;
                }
            })
            .addCase(deleteBlueprint.fulfilled, (s, a) => {
                const { author, name } = a.payload;
                if (s.byAuthor[author]) {
                    s.byAuthor[author] = s.byAuthor[author].filter(b => b.name !== name);
                }
                if (s.current?.name === name) s.current = null;
            })
    },
});

export const { setCurrentAuthor, setCurrentBlueprint, appendPoint } = slice.actions;
export default slice.reducer;


