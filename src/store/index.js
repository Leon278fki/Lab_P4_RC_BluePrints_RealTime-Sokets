import { configureStore } from '@reduxjs/toolkit'                                                                                                                                               
import blueprintsReducer from '../features/blueprints/blueprintsSlice.js'
    
export const store = configureStore({
    reducer: {
        blueprints: blueprintsReducer,
    },
})