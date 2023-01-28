package ai.hash.rustextra

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiDirectoryNode
import com.intellij.ide.projectView.impl.nodes.PsiFileSystemItemFilter
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiFile

class ModuleDirectoryNode(project: Project, value: PsiDirectory, viewSettings: ViewSettings, filter: PsiFileSystemItemFilter?) : PsiDirectoryNode(project, value, viewSettings, filter) {
    private val prepend = ArrayList<AbstractTreeNode<*>>();

    fun addPrepend(element: AbstractTreeNode<*>) {
        prepend.add(element);
    }

    override fun getChildrenImpl(): MutableCollection<AbstractTreeNode<*>> {
        val children = ArrayList<AbstractTreeNode<*>>()
        children.addAll(prepend)

        val parent = super.getChildrenImpl()
        if (parent != null) {
            children.addAll(parent)
        }

        return children
    }

    override fun contains(file: VirtualFile): Boolean {
        val additional = prepend.any { node: AbstractTreeNode<*> ->
            val value = node.value
            if (value is PsiFile) {
                value.virtualFile.equals(file)
            } else {
                false
            }
        };

        if (additional) {
            return true
        }

        return super.contains(file)
    }

    override fun updateImpl(data: PresentationData) {
        super.updateImpl(data)
    }

    companion object {
        fun fromPsiFileNode(node: PsiDirectoryNode) =
                ModuleDirectoryNode(node.project, node.value, node.settings, node.filter)
    }
}