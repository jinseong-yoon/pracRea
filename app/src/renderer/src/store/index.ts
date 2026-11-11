import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import {
  containersSlice,
  engineSlice,
  navSlice,
  settingsSlice,
  statsSlice,
  toastSlice
} from './slices'

export const store = configureStore({
  reducer: {
    nav: navSlice.reducer,
    toasts: toastSlice.reducer,
    engine: engineSlice.reducer,
    containers: containersSlice.reducer,
    stats: statsSlice.reducer,
    settings: settingsSlice.reducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

export const actions = {
  nav: navSlice.actions,
  toast: toastSlice.actions,
  containers: containersSlice.actions,
  stats: statsSlice.actions
}
