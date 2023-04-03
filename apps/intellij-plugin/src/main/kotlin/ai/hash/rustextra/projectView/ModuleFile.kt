package ai.hash.rustextra.projectView

import com.intellij.lang.FileASTNode
import com.intellij.lang.Language
import com.intellij.navigation.ItemPresentation
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.*
import com.intellij.psi.scope.PsiScopeProcessor
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.search.PsiElementProcessor
import com.intellij.psi.search.SearchScope
import javax.swing.Icon

class ModuleFile(private val file: PsiFile, private val directory: PsiDirectory): PsiFile {


    override fun <T : Any?> getUserData(key: Key<T>): T? {
        return file.getUserData(key)
    }

    override fun <T : Any?> putUserData(key: Key<T>, value: T?) {
        return file.putUserData(key, value)
    }

    override fun getIcon(flags: Int): Icon {
        return file.getIcon(flags)
    }

    override fun getProject(): Project {
        return file.project
    }

    override fun getLanguage(): Language {
        return file.language
    }

    override fun getManager(): PsiManager {
        return file.manager
    }

    override fun getChildren(): Array<PsiElement> {
        return directory.children
    }

    override fun getParent(): PsiDirectory? {
        return file.parent
    }

    override fun getFirstChild(): PsiElement {
        return directory.firstChild
    }

    override fun getLastChild(): PsiElement {
        return directory.lastChild
    }

    override fun getNextSibling(): PsiElement {
        val sibling = file.nextSibling;

        return if (sibling == directory) {
            directory.nextSibling
        } else {
            sibling
        }
    }

    override fun getPrevSibling(): PsiElement {
        val sibling = file.prevSibling;

        return if (sibling == directory) {
            directory.prevSibling
        } else {
            sibling
        }
    }

    override fun getContainingFile(): PsiFile {
        return file.containingFile
    }

    override fun getTextRange(): TextRange {
        return file.textRange
    }

    override fun getStartOffsetInParent(): Int {
        return file.startOffsetInParent
    }

    override fun getTextLength(): Int {
        return file.textLength
    }

    override fun findElementAt(offset: Int): PsiElement? {
        return directory.findElementAt(offset)
    }

    override fun findReferenceAt(offset: Int): PsiReference? {
        return directory.findReferenceAt(offset)
    }

    override fun getTextOffset(): Int {
        return file.textOffset
    }

    override fun getText(): String {
        return file.text
    }

    override fun textToCharArray(): CharArray {
        return file.textToCharArray()
    }

    override fun getNavigationElement(): PsiElement {
        return file.navigationElement
    }

    override fun getOriginalElement(): PsiElement {
        return file.originalElement
    }

    override fun textMatches(text: CharSequence): Boolean {
        return file.textMatches(text)
    }

    override fun textMatches(element: PsiElement): Boolean {
        return file.textMatches(text)
    }

    override fun textContains(c: Char): Boolean {
        return file.textContains(c)
    }

    override fun accept(visitor: PsiElementVisitor) {
        return file.accept(visitor)
    }

    override fun acceptChildren(visitor: PsiElementVisitor) {
        return directory.acceptChildren(visitor)
    }

    override fun copy(): PsiElement {
        return ModuleFile(file.copy().containingFile, directory)
    }

    override fun add(element: PsiElement): PsiElement {
        return directory.add(element)
    }

    override fun addBefore(element: PsiElement, anchor: PsiElement?): PsiElement {
        return directory.addBefore(element, anchor)
    }

    override fun addAfter(element: PsiElement, anchor: PsiElement?): PsiElement {
        return directory.addAfter(element, anchor)
    }

    override fun checkAdd(element: PsiElement) {
        return directory.checkAdd(element)
    }

    override fun addRange(first: PsiElement?, last: PsiElement?): PsiElement {
        return directory.addRange(first, last)
    }

    override fun addRangeBefore(first: PsiElement, last: PsiElement, anchor: PsiElement?): PsiElement {
        return directory.addRangeBefore(first, last, anchor)
    }

    override fun addRangeAfter(first: PsiElement?, last: PsiElement?, anchor: PsiElement?): PsiElement {
        return directory.addRangeAfter(first, last, anchor)
    }

    override fun delete() {
        directory.delete();
        file.delete();
    }

    override fun checkDelete() {
        directory.checkDelete();
        file.checkDelete();
    }

    override fun deleteChildRange(first: PsiElement?, last: PsiElement?) {
        directory.deleteChildRange(first, last)
    }

    override fun replace(newElement: PsiElement): PsiElement {
        directory.delete();
        return file.replace(newElement)
    }

    override fun isValid(): Boolean {
        return directory.isValid && file.isValid
    }

    override fun isWritable(): Boolean {
        return file.isWritable
    }

    override fun getReference(): PsiReference? {
        return file.reference
    }

    override fun getReferences(): Array<PsiReference> {
        return file.references
    }

    override fun <T : Any?> getCopyableUserData(key: Key<T>): T? {
        return file.getCopyableUserData(key)
    }

    override fun <T : Any?> putCopyableUserData(key: Key<T>, value: T?) {
        return file.putCopyableUserData(key, value)
    }

    override fun processDeclarations(
        processor: PsiScopeProcessor,
        state: ResolveState,
        lastParent: PsiElement?,
        place: PsiElement
    ): Boolean {
        return file.processDeclarations(processor, state, lastParent, place)
    }

    override fun getContext(): PsiElement? {
        return file.context
    }

    override fun isPhysical(): Boolean {
        return file.isPhysical
    }

    override fun getResolveScope(): GlobalSearchScope {
        return file.resolveScope
    }

    override fun getUseScope(): SearchScope {
        return file.useScope
    }

    override fun getNode(): FileASTNode {
        return file.node
    }

    override fun isEquivalentTo(another: PsiElement?): Boolean {
        return file.isEquivalentTo(another)
    }

    override fun getName(): String {
        return file.name
    }

    // TODO: is this correct?
    override fun setName(name: String): PsiElement {
        val bareName = name.removeSuffix(".rs");
        val fileName = "${bareName}.rs";

        return ModuleFile(file.setName(fileName) as PsiFile, directory.setName(bareName) as PsiDirectory)
    }

    override fun checkSetName(name: String?) {
        return file.checkSetName(name)
    }

    override fun navigate(requestFocus: Boolean) {
        return file.navigate(requestFocus)
    }

    override fun canNavigate(): Boolean {
        return file.canNavigate()
    }

    override fun canNavigateToSource(): Boolean {
        return file.canNavigateToSource()
    }

    override fun getPresentation(): ItemPresentation? {
        return file.presentation
    }

    override fun isDirectory(): Boolean {
        return true
    }

    override fun getVirtualFile(): VirtualFile {
        return file.virtualFile
    }

    override fun processChildren(processor: PsiElementProcessor<in PsiFileSystemItem>): Boolean {
        return directory.processChildren(processor)
    }

    override fun getContainingDirectory(): PsiDirectory {
        return file.containingDirectory
    }

    override fun getModificationStamp(): Long {
        return file.modificationStamp
    }

    override fun getOriginalFile(): PsiFile {
        return file.originalFile
    }

    override fun getFileType(): FileType {
        return file.fileType
    }

    override fun getPsiRoots(): Array<PsiFile> {
        return file.psiRoots
    }

    override fun getViewProvider(): FileViewProvider {
        return file.viewProvider
    }

    override fun subtreeChanged() {
        file.subtreeChanged();
    }

    companion object {
        val DATA_KEY: DataKey<List<ModuleFile>> = DataKey.create("moduleFile.array")
    }
}